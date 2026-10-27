import { PatientDocument } from '../../patient-documents/entities/patient-document.entity';
import { USER_SECRET_FIELDS, User } from './user.entity';

describe('User in a response', () => {
  const user = Object.assign(new User(), {
    id: 'u1',
    email: 'nurse@clinic.ke',
    firstName: 'Ada',
    password: '$2b$10$hash',
    resetCode: '123456',
    loginCode: '654321',
    totpSecret: 'v1:sealed',
    totpBackupCodes: ['h1'],
  });

  it('never carries a secret field', () => {
    const json = JSON.parse(JSON.stringify(user)) as Record<string, unknown>;
    for (const k of USER_SECRET_FIELDS) expect(json).not.toHaveProperty(k);
    expect(json).toMatchObject({
      id: 'u1',
      email: 'nurse@clinic.ke',
      firstName: 'Ada',
    });
  });

  it('not even when nested in another record, as a document’s uploader is', () => {
    const doc = Object.assign(new PatientDocument(), {
      id: 'd1',
      uploadedBy: user,
    });
    const text = JSON.stringify(doc);
    expect(text).not.toContain('$2b$10$hash');
    expect(text).not.toContain('654321');
    expect(text).not.toContain('123456');
    expect(text).toContain('nurse@clinic.ke');
  });

  it('keeps the fields on the object itself, for the code that needs them', () => {
    expect(user.password).toBe('$2b$10$hash');
  });
});
