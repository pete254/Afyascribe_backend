import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { createPrivateKey, createPublicKey } from 'crypto';

/**
 * How session tokens are signed — in one place, for every module that signs
 * or checks them.
 *
 * ES256 (ECDSA on P-256) when JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are set:
 * the private key signs and only the public key is needed to check, so
 * checking a token no longer means holding the power to make one. DHA's
 * Encryption Implementation Specification template asks for RS256 or ES256
 * (Encryption Specification C-4; Vulnerability Assessment V-12).
 * deploy/jwt-keys.sh makes the pair on the server.
 *
 * Without them, HS256 with JWT_SECRET, as before — so that deploying this does
 * not lock everyone out before the keys exist — with a warning in production.
 *
 * Keys are PEM. In .env, which holds one line per setting, the line breaks
 * are written as \n.
 */
export type JwtAlgorithm = 'ES256' | 'HS256';

export interface JwtKeys {
  algorithm: JwtAlgorithm;
  signKey: string;
  verifyKey: string;
}

const pem = (v: string | undefined) =>
  v
    ? v
        .trim()
        .replace(/^'(.*)'$/s, '$1')
        .replace(/\\n/g, '\n')
        .trim()
    : '';

export function jwtKeys(get: (name: string) => string | undefined): JwtKeys {
  const privateKey = pem(get('JWT_PRIVATE_KEY'));
  const publicKey = pem(get('JWT_PUBLIC_KEY'));

  if (privateKey || publicKey) {
    if (!privateKey || !publicKey) {
      throw new Error(
        'Set both JWT_PRIVATE_KEY and JWT_PUBLIC_KEY, or neither.',
      );
    }
    const priv = createPrivateKey(privateKey);
    const pub = createPublicKey(publicKey);
    if (priv.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      throw new Error('JWT_PRIVATE_KEY must be an EC P-256 key (ES256).');
    }
    // The public key must be this private key's: otherwise every token this
    // server signs would be refused by this same server.
    const derived = createPublicKey(priv).export({
      format: 'der',
      type: 'spki',
    });
    if (!derived.equals(pub.export({ format: 'der', type: 'spki' }))) {
      throw new Error(
        'JWT_PUBLIC_KEY is not the public half of JWT_PRIVATE_KEY.',
      );
    }
    return { algorithm: 'ES256', signKey: privateKey, verifyKey: publicKey };
  }

  const secret = get('JWT_SECRET');
  if (!secret)
    throw new Error(
      'Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY (or, failing that, JWT_SECRET).',
    );
  if (get('NODE_ENV') === 'production') {
    new Logger('JwtKeys').warn(
      'Session tokens are HS256 (shared secret). Run deploy/jwt-keys.sh to move to ES256.',
    );
  }
  return { algorithm: 'HS256', signKey: secret, verifyKey: secret };
}

/** The key and algorithms passport-jwt checks tokens with. */
export function jwtVerifyOptions(config: ConfigService): {
  secretOrKey: string;
  algorithms: JwtAlgorithm[];
} {
  const keys = jwtKeys((n) => config.get<string>(n));
  return { secretOrKey: keys.verifyKey, algorithms: [keys.algorithm] };
}

/** Options for JwtModule.registerAsync, from the keys above. */
export function jwtModuleOptions(
  config: ConfigService,
  expiresIn: number | string,
): JwtModuleOptions {
  const keys = jwtKeys((n) => config.get<string>(n));
  const signOptions = {
    algorithm: keys.algorithm,
    expiresIn,
  } as JwtModuleOptions['signOptions'];
  const verifyOptions = { algorithms: [keys.algorithm] };
  return keys.algorithm === 'ES256'
    ? {
        privateKey: keys.signKey,
        publicKey: keys.verifyKey,
        signOptions,
        verifyOptions,
      }
    : { secret: keys.signKey, signOptions, verifyOptions };
}
