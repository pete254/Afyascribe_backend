-- The off-site backup vault, on Neon. Holds only ciphertext.
--
-- Run once, as the Neon project owner, by deploy/vault-setup.sh (which also
-- creates the two logins below with random passwords). Idempotent.
--
-- What it guarantees, enforced by the database rather than by the scripts:
--
--   Write once.   An object and its parts can never be changed.
--   Locked.       An object cannot be deleted before its retain_until, by
--                 anyone using the writer or reader login. Expired objects are
--                 removed by the nightly lifecycle job.
--   Whole.        Parts cannot be added to an object once it exists.
--   Logged.       Every write, delete and read is recorded in backup_vault.log,
--                 which is itself append-only.
--
-- Logins (no others are given access):
--   afyascribe_vault_writer  on the production server: adds objects, removes
--                            expired ones, reads them back to check them.
--   afyascribe_vault_reader  in the company password manager: lists and reads,
--                            for restores and the monthly offline copy.
-- The owner login stays in the password manager, never on a server. Neon's own
-- account is protected by two-factor authentication.

create schema if not exists backup_vault;

create table if not exists backup_vault.objects (
  name         text primary key check (name ~ '^[a-z]+/[A-Za-z0-9._@:/+-]+$'),
  kind         text not null,
  tier         text not null default 'daily',
  created_at   timestamptz not null default now(),
  retain_until timestamptz not null,
  size         bigint not null,
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  parts        int not null check (parts >= 1),
  meta         jsonb not null default '{}'
);
create index if not exists objects_kind_created on backup_vault.objects (kind, created_at);
create index if not exists objects_retain on backup_vault.objects (retain_until);

create table if not exists backup_vault.parts (
  name text not null references backup_vault.objects(name) deferrable initially deferred,
  part int  not null check (part >= 0),
  data bytea not null,
  primary key (name, part)
);

create table if not exists backup_vault.log (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  who    text not null default session_user,
  action text not null,
  name   text,
  detail text
);

-- ── Guards ────────────────────────────────────────────────────────────────

create or replace function backup_vault.guard_objects() returns trigger
language plpgsql security definer set search_path = backup_vault, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'backup objects are write-once';
  elsif tg_op = 'INSERT' then
    if new.retain_until < now() + interval '1 day' then
      raise exception 'a backup must be locked for at least a day';
    end if;
    if (select count(*) from backup_vault.parts where name = new.name) <> new.parts then
      raise exception 'object % arrived with the wrong number of parts', new.name;
    end if;
    insert into backup_vault.log(action, name, detail)
      values ('put', new.name, new.kind || ' ' || new.tier || ' ' || new.size || ' bytes, locked until ' || new.retain_until);
    return new;
  elsif tg_op = 'DELETE' then
    if old.retain_until > now() then
      raise exception 'object % is locked until %', old.name, old.retain_until;
    end if;
    insert into backup_vault.log(action, name, detail) values ('delete', old.name, 'expired ' || old.retain_until);
    return old;
  end if;
  return null;
end $$;

create or replace function backup_vault.guard_parts() returns trigger
language plpgsql security definer set search_path = backup_vault, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'backup objects are write-once';
  elsif tg_op = 'INSERT' then
    if exists (select 1 from backup_vault.objects where name = new.name) then
      raise exception 'object % already exists', new.name;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from backup_vault.objects where name = old.name and retain_until > now()) then
      raise exception 'object % is locked', old.name;
    end if;
    return old;
  end if;
  return null;
end $$;

create or replace function backup_vault.no_truncate() returns trigger
language plpgsql as $$ begin raise exception 'the backup vault cannot be truncated'; end $$;

create or replace function backup_vault.log_append_only() returns trigger
language plpgsql as $$ begin raise exception 'the vault log is append-only'; end $$;

drop trigger if exists objects_guard on backup_vault.objects;
create trigger objects_guard before insert or update or delete on backup_vault.objects
  for each row execute function backup_vault.guard_objects();
drop trigger if exists parts_guard on backup_vault.parts;
create trigger parts_guard before insert or update or delete on backup_vault.parts
  for each row execute function backup_vault.guard_parts();
drop trigger if exists objects_no_truncate on backup_vault.objects;
create trigger objects_no_truncate before truncate on backup_vault.objects
  for each statement execute function backup_vault.no_truncate();
drop trigger if exists parts_no_truncate on backup_vault.parts;
create trigger parts_no_truncate before truncate on backup_vault.parts
  for each statement execute function backup_vault.no_truncate();
drop trigger if exists log_append_only on backup_vault.log;
create trigger log_append_only before update or delete on backup_vault.log
  for each row execute function backup_vault.log_append_only();
drop trigger if exists log_no_truncate on backup_vault.log;
create trigger log_no_truncate before truncate on backup_vault.log
  for each statement execute function backup_vault.no_truncate();

-- ── Reading, logged ───────────────────────────────────────────────────────
-- Neither login can select the data directly; reads go through here.
create or replace function backup_vault.fetch(p_name text)
returns table(part int, hex text)
language plpgsql security definer set search_path = backup_vault, pg_temp as $$
begin
  insert into backup_vault.log(action, name) values ('read', p_name);
  return query select p.part, encode(p.data, 'hex') from backup_vault.parts p where p.name = p_name order by p.part;
end $$;

-- ── Logins ────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'afyascribe_vault_writer') then
    create role afyascribe_vault_writer login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'afyascribe_vault_reader') then
    create role afyascribe_vault_reader login;
  end if;
end $$;

revoke all on schema backup_vault from public;
revoke all on all tables in schema backup_vault from public;
revoke all on all functions in schema backup_vault from public;

grant usage on schema backup_vault to afyascribe_vault_writer, afyascribe_vault_reader;
grant execute on function backup_vault.fetch(text) to afyascribe_vault_writer, afyascribe_vault_reader;

grant select, insert, delete on backup_vault.objects to afyascribe_vault_writer;
grant insert, delete on backup_vault.parts to afyascribe_vault_writer;
-- DELETE … WHERE needs to read the key columns; never the data.
grant select (name, part) on backup_vault.parts to afyascribe_vault_writer;
grant select on backup_vault.log to afyascribe_vault_writer;

grant select on backup_vault.objects, backup_vault.log to afyascribe_vault_reader;
