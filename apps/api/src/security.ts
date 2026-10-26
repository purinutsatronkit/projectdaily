import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function checkPassword(password: string, encoded: string) {
  const [algorithm, salt, digest] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !digest) return false;
  const expected = Buffer.from(digest, 'hex');
  const actual = await scrypt(password, salt, 64) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const hashApiKey = (secret: string) => createHash('sha256').update(secret).digest('hex');
export async function issueToken(userId: string, sessionId: string, secret: string) {
  return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId).setIssuer('taskflow').setAudience('taskflow-web')
    .setIssuedAt().setExpirationTime('5h').sign(new TextEncoder().encode(secret));
}
export async function verifyToken(token: string, secret: string) {
  return (await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'], issuer: 'taskflow', audience: 'taskflow-web'
  })).payload;
}
