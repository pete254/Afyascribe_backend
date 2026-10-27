import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { jwtKeys, jwtModuleOptions, jwtVerifyOptions } from './jwt-keys';

const pair = (curve = 'prime256v1') => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: curve,
  });
  return {
    priv: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    pub: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  };
};
// As they sit in .env: one line, breaks written as \n.
const oneLine = (pem: string) => pem.trim().replace(/\n/g, '\\n');
const config = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

describe('jwt keys', () => {
  const { priv, pub } = pair();
  const env = { JWT_PRIVATE_KEY: oneLine(priv), JWT_PUBLIC_KEY: oneLine(pub) };

  it('signs ES256 with the private key and checks with the public key', () => {
    const service = new JwtService(jwtModuleOptions(config(env), 60));
    const token = service.sign({ sub: 'u1' });
    expect(
      JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).alg,
    ).toBe('ES256');
    expect(jwt.verify(token, pub, { algorithms: ['ES256'] })).toMatchObject({
      sub: 'u1',
    });
  });

  it('accepts only ES256 — a token "signed" with the public key as an HS256 secret is refused', () => {
    const forged = jwt.sign({ sub: 'attacker' }, pub, { algorithm: 'HS256' });
    const { secretOrKey, algorithms } = jwtVerifyOptions(config(env));
    expect(algorithms).toEqual(['ES256']);
    expect(() => jwt.verify(forged, secretOrKey, { algorithms })).toThrow();
  });

  it('refuses a public key that is not the private key’s', () => {
    expect(() =>
      jwtKeys((k) => ({ ...env, JWT_PUBLIC_KEY: oneLine(pair().pub) })[k]),
    ).toThrow(/public half/);
  });

  it('refuses a key on another curve', () => {
    const other = pair('secp384r1');
    expect(() =>
      jwtKeys(
        (k) =>
          ({
            JWT_PRIVATE_KEY: oneLine(other.priv),
            JWT_PUBLIC_KEY: oneLine(other.pub),
          })[k],
      ),
    ).toThrow(/P-256/);
  });

  it('refuses half a pair', () => {
    expect(() =>
      jwtKeys(
        (k) =>
          ({ JWT_PRIVATE_KEY: env.JWT_PRIVATE_KEY })[k as 'JWT_PRIVATE_KEY'],
      ),
    ).toThrow(/both/);
  });

  it('falls back to HS256 with JWT_SECRET when no keys are set', () => {
    expect(
      jwtKeys((k) => ({ JWT_SECRET: 's3cret' })[k as 'JWT_SECRET']),
    ).toMatchObject({ algorithm: 'HS256' });
    expect(() => jwtKeys(() => undefined)).toThrow();
  });
});
