import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

/**
 * Password rules and hashing strength.
 *
 * DHA's Technical Specifications template (§3.4, Security Requirements) names
 * the standard: "Password Policy — Min 12 chars, complexity rules — NIST
 * 800-63B". Kept in one place so the policy, the validation messages and the
 * document that describes them cannot drift apart.
 *
 * A note on what NIST 800-63B actually says, since it is often misquoted: it
 * argues *against* forced periodic rotation and against mandatory character
 * composition rules, on the evidence that both push people towards predictable
 * passwords. It argues *for* length, and for screening against known-breached
 * passwords. DHA asks for complexity rules, so they are here — but length is
 * the control doing the real work.
 */

/** DHA's stated minimum. */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Long enough that complexity stops earning its keep. A passphrase of four
 * words beats a short string with a symbol bolted on, and refusing it would
 * push people towards the weaker option.
 */
export const PASSWORD_COMPLEXITY_EXEMPT_LENGTH = 20;

/**
 * bcrypt cost. Raised from 10, which was low for 2026 — each increment doubles
 * the work an attacker must do per guess.
 *
 * Existing hashes keep verifying: bcrypt stores the cost inside the hash, so
 * old passwords still check out and are re-hashed at the new cost whenever
 * they are next changed. No migration, no forced reset.
 */
export const PASSWORD_HASH_ROUNDS = 12;

const RULES: { test: RegExp; name: string }[] = [
  { test: /[a-z]/, name: 'a lowercase letter' },
  { test: /[A-Z]/, name: 'an uppercase letter' },
  { test: /[0-9]/, name: 'a number' },
  { test: /[^A-Za-z0-9]/, name: 'a symbol' },
];

/**
 * Why a password is unacceptable, or null if it is fine.
 *
 * Returns the whole reason at once rather than the first failure, so someone
 * fixing a password is not sent round the loop four times.
 */
export function passwordProblem(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length >= PASSWORD_COMPLEXITY_EXEMPT_LENGTH) return null;

  const missing = RULES.filter((r) => !r.test.test(password)).map((r) => r.name);
  if (!missing.length) return null;

  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `Password needs ${list}. A passphrase of ${PASSWORD_COMPLEXITY_EXEMPT_LENGTH} characters or more needs none of these.`;
}

export const isPasswordAcceptable = (password: string): boolean =>
  passwordProblem(password) === null;

// ── Validation decorator ────────────────────────────────────────────────────

/**
 * Enforce the policy on a DTO field, with the reason given back to the caller.
 *
 * A single decorator rather than a stack of `@Matches` rules, so the message
 * names everything that is wrong at once instead of one thing at a time.
 */
export function IsAcceptablePassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAcceptablePassword',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && passwordProblem(value) === null,
        defaultMessage: (args: ValidationArguments) =>
          typeof args.value === 'string'
            ? (passwordProblem(args.value) ?? 'Password is not acceptable.')
            : 'Password must be text.',
      },
    });
  };
}
