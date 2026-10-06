import {
  PASSWORD_HASH_ROUNDS,
  PASSWORD_MIN_LENGTH,
  isPasswordAcceptable,
  passwordProblem,
} from './password.policy';

describe('password policy', () => {
  it('requires the length DHA specifies', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(passwordProblem('Short1!')).toMatch(/at least 12 characters/);
  });

  it('rejects the old eight-character minimum', () => {
    // The previous rule allowed this; the specification does not.
    expect(isPasswordAcceptable('Passw0rd')).toBe(false);
  });

  it('accepts a twelve-character password with all four classes', () => {
    expect(passwordProblem('Sh0rtButFine!')).toBeNull();
  });

  it('names everything missing at once rather than one thing at a time', () => {
    const problem = passwordProblem('alllowercase');
    expect(problem).toMatch(/an uppercase letter/);
    expect(problem).toMatch(/a number/);
    expect(problem).toMatch(/a symbol/);
  });

  it('reads as a sentence when several classes are missing', () => {
    expect(passwordProblem('alllowercase')).toMatch(
      /an uppercase letter, a number and a symbol/,
    );
  });

  it('names just the one when only one is missing', () => {
    const problem = passwordProblem('NoSymbolHere1');
    expect(problem).toMatch(/needs a symbol\./);
    expect(problem).not.toMatch(/,/);
  });

  it('lets a long passphrase through without complexity', () => {
    // Length is the control doing the real work; refusing this would push
    // people towards a shorter password with a symbol bolted on.
    expect(passwordProblem('correct horse battery staple')).toBeNull();
  });

  it('still enforces complexity just below the passphrase threshold', () => {
    const justUnder = 'a'.repeat(19);
    expect(justUnder).toHaveLength(19);
    expect(isPasswordAcceptable(justUnder)).toBe(false);
  });

  it('explains the passphrase escape hatch in the message', () => {
    expect(passwordProblem('nocomplexity')).toMatch(/20 characters or more needs none/);
  });

  it('rejects an empty or missing password without throwing', () => {
    expect(isPasswordAcceptable('')).toBe(false);
    expect(isPasswordAcceptable(undefined as unknown as string)).toBe(false);
  });

  it('hashes at a cost above the old default', () => {
    // Each increment doubles the work per guess; 10 was low for 2026.
    expect(PASSWORD_HASH_ROUNDS).toBeGreaterThan(10);
  });
});
