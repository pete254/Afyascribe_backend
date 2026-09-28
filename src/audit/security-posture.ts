/**
 * What this system does about security, stated so it can be checked.
 *
 * Written to be read by someone filling in an attestation, and by someone
 * auditing one. Two rules govern it: nothing is claimed that the code does not
 * do, and anything that depends on how the system is hosted is marked as such
 * rather than asserted on the operator's behalf.
 */

export interface PostureItem {
  control: string;
  status: 'implemented' | 'provider' | 'operator' | 'not-implemented';
  detail: string;
  /** Where to look to confirm it. */
  evidence?: string;
}

export const ENCRYPTION_STANDARD = 'AES-256 for data at rest, TLS 1.2/1.3 for data in transit';

export function securityPosture(opts: {
  retentionYears: number;
  versionedEntities: number;
  transitVerified: boolean;
}): { encryptionStandard: string; items: PostureItem[]; note: string } {
  return {
    encryptionStandard: ENCRYPTION_STANDARD,
    note:
      'Items marked "provider" are properties of the managed database and hosting, not of this code. Items marked "operator" need a person to do or confirm something. Neither is claimed as implemented here.',
    items: [
      {
        control: 'Data at rest encrypted',
        status: 'provider',
        detail:
          'The managed database encrypts stored data with AES-256. This system holds no unencrypted copy of the database.',
        evidence: "The database provider's security documentation.",
      },
      {
        control: 'Data in transit encrypted',
        status: 'implemented',
        detail: opts.transitVerified
          ? 'TLS is required for the database connection and the server certificate is verified, so the connection is both encrypted and authenticated.'
          : 'TLS is required for the database connection, but certificate verification has been switched off by configuration — the connection is encrypted but not authenticated.',
        evidence: 'DB_SSL_REJECT_UNAUTHORIZED, and the TLS settings in the application module.',
      },
      {
        control: 'Key management',
        status: 'provider',
        detail:
          'Encryption keys are held and rotated by the database and hosting providers. This system stores no encryption keys of its own.',
      },
      {
        control: 'Audit trail — tamper-resistant',
        status: 'implemented',
        detail:
          'Every line is chained by SHA-256 to the one before it, and the table refuses UPDATE and DELETE at the database level. A change cannot be hidden, though a database superuser could still make one.',
        evidence: 'GET /audit/integrity verifies the chain and names any break.',
      },
      {
        control: 'Audit trail — tracks user actions',
        status: 'implemented',
        detail: 'Every authenticated write, and every read that reaches patient data, with actor, action and time.',
        evidence: 'GET /audit',
      },
      {
        control: 'Audit trail — tracks data changes',
        status: 'implemented',
        detail: `Field-level before and after values for ${opts.versionedEntities} clinical record types.`,
        evidence: 'GET /audit/changes',
      },
      {
        control: 'Version tracking',
        status: 'implemented',
        detail: 'Each clinical record carries a numbered history, from creation through every change.',
        evidence: 'GET /audit/versions/{entity}/{id}',
      },
      {
        control: 'Amendment tracking',
        status: 'implemented',
        detail:
          'A change made after the fact carries the reason given for it, and amendments can be listed on their own.',
        evidence: 'GET /audit/amendments, and the X-Change-Reason header.',
      },
      {
        control: 'Audit retention',
        status: 'implemented',
        detail: `Nothing in this system prunes the ledger. The obligation is ${opts.retentionYears} years.`,
      },
      {
        control: 'Audit review',
        status: 'operator',
        detail: 'Quarterly review is recorded with the integrity check run at the time — but somebody has to do it.',
        evidence: 'GET /audit/reviews shows when the next one falls due.',
      },
      {
        control: 'Backup and disaster recovery',
        status: 'provider',
        detail:
          'Backups and point-in-time recovery are properties of the managed database. Frequency, retention, recovery objectives and the date recovery was last tested are the operator’s to state and to verify — this system cannot observe them.',
      },
      {
        control: 'Checksum verification',
        status: 'implemented',
        detail:
          'Each signed record carries the SHA-256 of its canonical form, so a record altered after signing is detectable. The audit ledger is chained by the same means.',
        evidence: 'GET /signatures/verify/{entity}/{id}',
      },
      {
        control: 'Digital signatures',
        status: 'implemented',
        detail:
          'Ed25519, with a key per practitioner whose private half is encrypted under a PIN only they know. Nobody can sign as a practitioner without that PIN — not an administrator, not anyone holding the database. The PIN does reach the server to sign, so this attests the practitioner rather than their hardware; a smartcard would be stronger.',
        evidence: 'GET /signatures/public-key/{fingerprint} lets a signature be checked without this system.',
      },
      {
        control: 'Access control',
        status: 'implemented',
        detail:
          'Role-based, with per-user capability overrides; the audit ledger is restricted to facility administrators.',
      },
      {
        control: 'Automatic logoff',
        status: 'implemented',
        detail:
          'A session lapses after a period without interaction. A client in use extends it as the user works; one nobody has touched does not, and the session ends.',
        evidence: 'AUTH_SESSION_MINUTES.',
      },
      {
        control: 'Emergency access procedures',
        status: 'implemented',
        detail:
          'A restricted record opens to anyone who states a reason. Nobody is refused — the reason is the control. Access is time-boxed, lapses on its own, and is put in front of an administrator afterwards.',
        evidence: 'GET /emergency-access lists grants awaiting review.',
      },
      {
        control: 'Multi-factor authentication',
        status: 'implemented',
        detail: 'A one-time code is emailed after a correct password, with attempt limits and expiry.',
      },
    ],
  };
}
