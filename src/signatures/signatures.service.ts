import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PractitionerKey } from './entities/practitioner-key.entity';
import { RecordSignature } from './entities/record-signature.entity';
import { User } from '../users/entities/user.entity';
import {
  SIGNATURE_ALGORITHM,
  canonicalRecord,
  createKeyPair,
  payloadHash,
  signHash,
  unlock,
  verifySignature,
} from './signing';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

/** Records a practitioner may sign, and the table each lives in. */
const SIGNABLE: Record<string, string> = {
  SoapNote: 'soap_notes',
  Prescription: 'prescriptions',
  LabOrderItem: 'lab_order_items',
  Radiology: 'radiology',
  DiseaseNotification: 'disease_notifications',
  Delivery: 'deliveries',
  WeeklyReturn: 'idsr_weekly_returns',
};

const MIN_PIN = 6;

@Injectable()
export class SignaturesService {
  constructor(
    @InjectRepository(PractitionerKey) private readonly keys: Repository<PractitionerKey>,
    @InjectRepository(RecordSignature) private readonly signatures: Repository<RecordSignature>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  signableTypes() {
    return {
      algorithm: SIGNATURE_ALGORITHM,
      types: Object.keys(SIGNABLE),
      note:
        'A signature is made with a key only the practitioner can unlock. The PIN reaches the server to sign, so this is stronger than a single system key and weaker than a smartcard — it attests the practitioner, not their hardware.',
    };
  }

  // ── Keys ──────────────────────────────────────────────────────────────────

  async myKey(userId: string): Promise<PractitionerKey | null> {
    return this.keys.findOne({ where: { userId, revokedAt: IsNull() } });
  }

  /**
   * Enrol a practitioner, or rotate their key.
   *
   * Rotating revokes rather than replaces: signatures already made have to stay
   * verifiable, and that needs the public half they were made with.
   */
  async enrol(user: CurrentUserType, pin: string, rotateReason?: string): Promise<PractitionerKey> {
    if (!pin || pin.trim().length < MIN_PIN) {
      throw new BadRequestException(`A signing PIN must be at least ${MIN_PIN} characters.`);
    }

    const record = await this.users.findOne({ where: { id: user.id } });
    const existing = await this.myKey(user.id);

    return this.dataSource.transaction(async (manager) => {
      if (existing) {
        existing.revokedAt = new Date();
        existing.revokedReason = rotateReason?.trim() || 'Rotated by the practitioner';
        await manager.save(existing);
      }

      const material = createKeyPair(pin.trim());
      return manager.save(
        manager.create(PractitionerKey, {
          userId: user.id,
          facilityId: user.facilityId ?? null,
          ...material,
          algorithm: SIGNATURE_ALGORITHM,
          practitionerNo: record?.practitionerNo ?? null,
          regulatoryBody: (record as unknown as { regulatoryBody?: string })?.regulatoryBody ?? null,
        }),
      );
    });
  }

  /** The public half, for anyone verifying a signature independently. */
  async publicKey(fingerprint: string): Promise<{ fingerprint: string; publicKey: string; algorithm: string }> {
    const key = await this.keys.findOne({ where: { fingerprint } });
    if (!key) throw new NotFoundException('No such key');
    return { fingerprint: key.fingerprint, publicKey: key.publicKey, algorithm: key.algorithm };
  }

  // ── Signing ───────────────────────────────────────────────────────────────

  private async loadRecord(entityName: string, entityId: string): Promise<Record<string, unknown>> {
    const table = SIGNABLE[entityName];
    if (!table) throw new BadRequestException(`${entityName} is not a record this system signs.`);
    const [row] = (await this.dataSource.query(`SELECT * FROM "${table}" WHERE id = $1`, [
      entityId,
    ])) as Record<string, unknown>[];
    if (!row) throw new NotFoundException('Record not found');
    return row;
  }

  /**
   * Sign a record.
   *
   * The PIN is used to unlock the key and is not stored, logged, or kept
   * beyond this call.
   */
  async sign(
    user: CurrentUserType,
    input: { entityName: string; entityId: string; pin: string; purpose?: string },
  ): Promise<RecordSignature> {
    const key = await this.myKey(user.id);
    if (!key) {
      throw new BadRequestException('You have no signing key yet. Set a signing PIN to create one.');
    }

    const privateKey = unlock(key, input.pin ?? '');
    if (!privateKey) throw new BadRequestException('That signing PIN is not right.');

    const record = await this.loadRecord(input.entityName, input.entityId);
    const hash = payloadHash(canonicalRecord(record));

    const already = await this.signatures.findOne({
      where: {
        entityName: input.entityName,
        entityId: input.entityId,
        signedById: user.id,
        payloadHash: hash,
      },
    });
    // Signing the same unchanged record twice adds nothing.
    if (already) return already;

    const record2 = await this.users.findOne({ where: { id: user.id } });
    return this.signatures.save(
      this.signatures.create({
        facilityId: user.facilityId ?? null,
        entityName: input.entityName,
        entityId: input.entityId,
        purpose: input.purpose?.trim() || 'authored',
        payloadHash: hash,
        signature: signHash(privateKey, hash),
        keyId: key.id,
        publicKey: key.publicKey,
        fingerprint: key.fingerprint,
        signedById: user.id,
        signedByName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || null,
        practitionerNo: record2?.practitionerNo ?? null,
        signedAt: new Date(),
      }),
    );
  }

  // ── Verifying ─────────────────────────────────────────────────────────────

  /**
   * Check every signature on a record.
   *
   * Two things can be wrong and they are not the same. If the record's
   * checksum no longer matches, it was altered after signing. If the signature
   * itself does not verify, it is not the signature it claims to be. A
   * reviewer needs to be told which.
   */
  async verifyRecord(entityName: string, entityId: string) {
    const signatures = await this.signatures.find({
      where: { entityName, entityId },
      order: { signedAt: 'ASC' },
    });
    if (!signatures.length) {
      return { entityName, entityId, signed: false, currentHash: null, signatures: [] };
    }

    const record = await this.loadRecord(entityName, entityId);
    const currentHash = payloadHash(canonicalRecord(record));

    return {
      entityName,
      entityId,
      signed: true,
      currentHash,
      signatures: signatures.map((s) => {
        const signatureValid = verifySignature(s.publicKey, s.payloadHash, s.signature);
        const unchanged = s.payloadHash === currentHash;
        return {
          id: s.id,
          purpose: s.purpose,
          signedByName: s.signedByName,
          practitionerNo: s.practitionerNo,
          fingerprint: s.fingerprint,
          signedAt: s.signedAt,
          signatureValid,
          recordUnchanged: unchanged,
          verdict: !signatureValid
            ? 'The signature does not verify against the key it names.'
            : unchanged
              ? 'Valid, and the record is as it was signed.'
              : 'The signature is genuine, but the record has changed since it was signed.',
        };
      }),
    };
  }

  async forRecord(entityName: string, entityId: string): Promise<RecordSignature[]> {
    return this.signatures.find({ where: { entityName, entityId }, order: { signedAt: 'ASC' } });
  }
}
