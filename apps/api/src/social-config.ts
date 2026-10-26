import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { trustedPublicUrl } from './mail.ts';

export interface SocialConfig {
  publicUrl:string;
  google?:{clientId:string;clientSecret:string};
  github?:{clientId:string;clientSecret:string;slug?:string};
  tokenKey?:string;
  fetch?:typeof fetch;
  verifyGoogle?:(token:string,nonce:string)=>Promise<{sub:string;email:string;name:string}>;
}
export function socialFromEnvironment(env:NodeJS.ProcessEnv=process.env):SocialConfig {
  const pair=(prefix:string)=>{
    const clientId=env[`${prefix}_CLIENT_ID`]?.trim(),clientSecret=env[`${prefix}_CLIENT_SECRET`]?.trim();
    if(Boolean(clientId)!==Boolean(clientSecret)) throw new Error(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must both be set.`);
    return clientId&&clientSecret?{clientId,clientSecret}:undefined;
  };
  const google=pair('GOOGLE'),github=pair('GITHUB'),tokenKey=env.OAUTH_TOKEN_KEY?.trim();
  if(github&&!/^[a-f0-9]{64}$/i.test(tokenKey??'')) throw new Error('Set OAUTH_TOKEN_KEY to 32 random bytes encoded as 64 hex characters.');
  const slug=env.GITHUB_APP_SLUG?.trim();
  if(slug&&!/^[a-z0-9-]+$/i.test(slug)) throw new Error('GITHUB_APP_SLUG is invalid.');
  return {publicUrl:trustedPublicUrl(env.APP_PUBLIC_URL||env.APP_ORIGIN||'http://localhost:5173',env.NODE_ENV==='production'),google,github:github?{...github,slug}:undefined,tokenKey};
}
export function seal(value:string,key:string,owner:string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  cipher.setAAD(Buffer.from(owner));
  const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64');
}
export function unseal(value:string,key:string,owner:string) {
  const bytes=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),bytes.subarray(0,12));
  decipher.setAAD(Buffer.from(owner));decipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
}
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function googleIdentity(config:SocialConfig,token:string,nonce:string) {
  if(config.verifyGoogle) return config.verifyGoogle(token,nonce);
  const {payload}=await jwtVerify(token,googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:config.google!.clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce','email']});
  if(payload.nonce!==nonce||payload.email_verified!==true||!payload.sub||typeof payload.email!=='string'||(payload.azp&&payload.azp!==config.google!.clientId)) throw new Error('Invalid Google identity');
  return {sub:payload.sub,email:payload.email,name:typeof payload.name==='string'?payload.name:payload.email.split('@')[0]};
}
