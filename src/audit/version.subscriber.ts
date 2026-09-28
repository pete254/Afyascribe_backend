import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { FieldChange, RecordVersion } from './entities/record-version.entity';
import { currentActor } from './request-context';

/**
 * Records that hold clinical or personal information, and are therefore worth
 * versioning.
 *
 * An allow-list rather than a deny-list, for the same reason the read-audit
 * uses one: a table added later is a visible omission rather than an invisible
 * one. Reference data, catalogues and the ledgers themselves are not here —
 * versioning the audit ledger would be circular, and versioning a price list
 * would bury the changes that matter.
 */
const VERSIONED = new Set([
  'Patient',
  'PatientIdentifier',
  'SoapNote',
  'PatientProblem',
  'PatientAllergy',
  'Prescription',
  'PrescriptionItem',
  'LabOrderItem',
  'Radiology',
  'FamilyHistory',
  'Immunisation',
  'Pregnancy',
  'AncContact',
  'PncContact',
  'Delivery',
  'Birth',
  'LabourObservation',
  'DiseaseNotification',
  'WeeklyReturn',
  'PatientVisit',
  'Billing',
]);

/**
 * Fields never written to a version.
 *
 * Secrets, obviously. But also the timestamps TypeORM maintains: recording
 * that `updatedAt` changed on every update would drown the real change in
 * noise, and it is already implied by the version's own timestamp.
 */
/** How many record types are versioned, for the security posture. */
export const VERSIONED_ENTITY_COUNT = VERSIONED.size;

const NEVER_RECORD = new Set([
  'password',
  'passwordHash',
  'passwordResetToken',
  'refreshToken',
  'token',
  'secret',
  'otp',
  'createdAt',
  'updatedAt',
  'version',
]);

const MAX_VALUE_LENGTH = 2000;

/** Values go in as they are, except when they are too big to be worth keeping. */
function trim(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}… (truncated)` : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    if (json && json.length > MAX_VALUE_LENGTH) return `${json.slice(0, MAX_VALUE_LENGTH)}… (truncated)`;
    return value;
  }
  return value;
}

const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a == null && b == null) return true;
  if (typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  // A numeric column comes back as a string; "5" and 5 are not a change.
  if ((typeof a === 'number' && typeof b === 'string') || (typeof a === 'string' && typeof b === 'number')) {
    return String(a) === String(b);
  }
  return false;
};

/**
 * Versions every change to a clinical record.
 *
 * Listens below the service layer so nothing has to remember to call it: a
 * change made by a route nobody thought about is still versioned.
 */
@Injectable()
@EventSubscriber()
export class RecordVersionSubscriber implements EntitySubscriberInterface {
  constructor(private readonly dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  private nameOf(event: { metadata: { targetName: string } }): string {
    return event.metadata.targetName;
  }

  private tracked(name: string): boolean {
    return VERSIONED.has(name);
  }

  /** The next version number for a record. */
  private async nextVersion(manager: UpdateEvent<unknown>['manager'], entityName: string, entityId: string) {
    const [row] = (await manager.query(
      'SELECT COALESCE(MAX(version), 0) AS v FROM record_versions WHERE entity_name = $1 AND entity_id = $2',
      [entityName, entityId],
    )) as { v: string }[];
    return Number(row?.v ?? 0) + 1;
  }

  private async write(
    manager: UpdateEvent<unknown>['manager'],
    entityName: string,
    entity: Record<string, unknown>,
    operation: 'created' | 'updated' | 'deleted',
    changes: FieldChange[],
  ) {
    const id = String(entity?.id ?? '');
    if (!id) return;

    const actor = currentActor();
    await manager.insert(RecordVersion, {
      facilityId: (entity.facilityId as string) ?? actor?.facilityId ?? null,
      entityName,
      entityId: id,
      version: await this.nextVersion(manager, entityName, id),
      operation,
      changes,
      patientId: (entity.patientId as string) ?? (entity.motherPatientId as string) ?? null,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      actorRole: actor?.role ?? null,
      reason: actor?.reason ?? null,
    });
  }

  async afterInsert(event: InsertEvent<Record<string, unknown>>): Promise<void> {
    const name = this.nameOf(event);
    if (!this.tracked(name) || !event.entity) return;
    try {
      // The first version is the record as it was created — the fields it
      // arrived with, so a history starts from something rather than nothing.
      const changes: FieldChange[] = Object.entries(event.entity)
        .filter(([field, value]) => !NEVER_RECORD.has(field) && value !== undefined && value !== null)
        .map(([field, value]) => ({ field, from: null, to: trim(value) }));
      await this.write(event.manager, name, event.entity, 'created', changes);
    } catch {
      // Versioning must never break the write it is recording.
    }
  }

  async afterUpdate(event: UpdateEvent<Record<string, unknown>>): Promise<void> {
    const name = this.nameOf(event);
    if (!this.tracked(name) || !event.entity) return;
    try {
      const before = (event.databaseEntity ?? {}) as Record<string, unknown>;
      const after = event.entity as Record<string, unknown>;

      const fields = event.updatedColumns.length
        ? event.updatedColumns.map((c) => c.propertyName)
        : Object.keys(after);

      const changes: FieldChange[] = [];
      for (const field of fields) {
        if (NEVER_RECORD.has(field)) continue;
        if (same(before[field], after[field])) continue;
        changes.push({ field, from: trim(before[field]), to: trim(after[field]) });
      }

      // An update that moved nothing is not a version.
      if (!changes.length) return;
      await this.write(event.manager, name, after, 'updated', changes);
    } catch {
      // As above.
    }
  }

  async afterRemove(event: RemoveEvent<Record<string, unknown>>): Promise<void> {
    const name = this.nameOf(event);
    const entity = (event.databaseEntity ?? event.entity) as Record<string, unknown> | undefined;
    if (!this.tracked(name) || !entity) return;
    try {
      // What was there when it went, so a deletion is not a blank.
      const changes: FieldChange[] = Object.entries(entity)
        .filter(([field, value]) => !NEVER_RECORD.has(field) && value !== undefined && value !== null)
        .map(([field, value]) => ({ field, from: trim(value), to: null }));
      await this.write(event.manager, name, { ...entity, id: event.entityId ?? entity.id }, 'deleted', changes);
    } catch {
      // As above.
    }
  }
}
