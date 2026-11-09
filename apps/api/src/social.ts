import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Hono} from 'hono';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import {z} from 'zod';
import {loginSchema} from '@taskflow/shared';
import {ApiError,all,get,now,parseBody,transaction,type Config,type Env,type AppContext} from './context.ts';
import {sessionMiddleware,startSession} from './auth.ts';
import {readUser} from './account.ts';
import {verifyToken} from './security.ts';
import {googleIdentity,seal,type SocialConfig} from './social-config.ts';
import type {Database} from './db.ts';

export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
type State={user_id:string|null;session_id:string|null;verifier:string;nonce:string;browser_hash:string};
export async function exchange(config:SocialConfig,provider:'google'|'github',values:Record<string,string>) {
  const credentials=config[provider]!;
  const response=await (config.fetch??fetch)(provider==='google'?'https://oauth2.googleapis.com/token':'https://github.com/login/oauth/access_token',{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:credentials.clientId,client_secret:credentials.clientSecret,...values}),signal:AbortSignal.timeout(15000),redirect:'error',
  });
  const result=await response.json() as Record<string,unknown>;
  if(!response.ok||result.error||typeof result.access_token!=='string') throw new ApiError(503,'OAUTH_EXCHANGE_FAILED','เชื่อมต่อบัญชีไม่สำเร็จ กรุณาตรวจค่าของแอปและลองใหม่');
  return result;
}
export function tokenPayload(value:Record<string,unknown>) {
  return JSON.stringify({access_token:value.access_token,refresh_token:typeof value.refresh_token==='string'?value.refresh_token:undefined,
    expires_at:typeof value.expires_in==='number'?Date.now()+value.expires_in*1000:null});
}
type Provider = 'google' | 'github';
type ProviderIdentity = { sub: string; email?: string; name: string };

async function readProviderIdentity(social: SocialConfig, provider: Provider, token: Record<string, unknown>, nonce: string, production: Config['production']): Promise<ProviderIdentity> {
  let identity: ProviderIdentity;
  if(provider==='google') {
    if(typeof token.id_token!=='string') throw new Error('Missing identity');
    identity=await googleIdentity(social,token.id_token,nonce);
    identity.email=loginSchema.shape.email.parse(identity.email);
    if(production&&identity.email==='demo@taskflow.local') throw new Error('Demo disabled');
  } else {
    const response=await (social.fetch??fetch)('https://api.github.com/user',{headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000),redirect:'error'});
    const user=await response.json() as {id:number;login:string};
    if(!response.ok||!Number.isSafeInteger(user.id)||typeof user.login!=='string') throw new Error('Invalid GitHub user');
    identity={sub:String(user.id),name:user.login};
  }
  return identity;
}

async function createOAuthUser(db: Database, provider: Provider, identity: ProviderIdentity) {
  if(provider!=='google'||!identity.email) throw new Error('Login unavailable');
  // Never silently link by email: the existing owner must authenticate first.
  if(await get(db,'SELECT id FROM users WHERE email=?',identity.email)) throw new ApiError(409,'LINK_REQUIRED','เข้าสู่บัญชีเดิมก่อน แล้วเชื่อม Google ในตั้งค่าบัญชี');
  const id = randomUUID();
  await db.prepare('INSERT INTO users(id,name,email,password_hash,created_at,email_verified_at) VALUES(?,?,?,?,?,?)').run(id,identity.name.trim().slice(0,80)||'Google user',identity.email,'oauth-only',now(),now());
  return id;
}

async function connectIdentity(db: Database, social: SocialConfig, provider: Provider, pending: State, identity: ProviderIdentity, token: Record<string, unknown>) {
  return transaction(db,async ()=>{
    const existing=await get<{user_id:string}>(db,'SELECT user_id FROM connected_accounts WHERE provider=? AND subject=?',provider,identity.sub);
    if(pending.user_id&&existing&&existing.user_id!==pending.user_id) throw new ApiError(409,'ALREADY_LINKED','บัญชีนี้เชื่อมกับผู้ใช้อื่นแล้ว');
    let id=pending.user_id??existing?.user_id;
    if(!id) {
      id = await createOAuthUser(db, provider, identity);
    }
    const previous=await get<{subject:string}>(db,'SELECT subject FROM connected_accounts WHERE user_id=? AND provider=?',id,provider);
    if(previous&&previous.subject!==identity.sub) throw new ApiError(409,'ALREADY_LINKED','มีบัญชีที่เชื่อมไว้แล้ว');
    const cipher=provider==='github'?seal(tokenPayload(token),social.tokenKey!,id):null;
    if(provider==='google'&&identity.email){await db.prepare('UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=? AND email=?').run(now(),id,identity.email);}
    await db.prepare('INSERT INTO connected_accounts(user_id,provider,subject,login,token_cipher,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET login=excluded.login,token_cipher=excluded.token_cipher,updated_at=excluded.updated_at')
      .run(id,provider,identity.sub,provider==='google'?identity.email!:identity.name,cipher,now());
    return id;
  });
}

function providerEnabled(social: SocialConfig | undefined, provider: Provider) {
  return Boolean(social?.[provider] && (provider !== 'github' || social.tokenKey));
}

async function consumeOAuthState(db: Database, config: Config, c: AppContext, provider: Provider) {
  const state=c.req.query('state')??'',browser=getCookie(c,`taskflow_oauth_${provider}`)??'';
  if(!state||!browser) throw new Error('Missing state');
  const pending=await get<State>(db,'SELECT user_id,session_id,verifier,nonce,browser_hash FROM oauth_states WHERE state_hash=? AND provider=? AND expires_at>?',digest(state),provider,now());
  if(!pending||pending.browser_hash!==digest(browser)) throw new Error('Invalid state');
  await db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(digest(state));
  deleteCookie(c,`taskflow_oauth_${provider}`,{path:`/api/auth/${provider}`,secure:!!config.production,sameSite:'Lax'});
  return pending;
}

async function validateOAuthLink(db: Database, config: Config, c: AppContext, pending: State) {
  if(!pending.user_id) return;
  const payload=await verifyToken(getCookie(c,'taskflow_session')??'',config.secret);
  if(payload.sub!==pending.user_id||payload.sid!==pending.session_id||!await get(db,'SELECT id FROM auth_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?',pending.session_id!,pending.user_id,now())) throw new Error('Session changed');
  if(config.production&&(await readUser(db,pending.user_id)).email==='demo@taskflow.local') throw new Error('Demo disabled');
}

function oauthFailureReason(error: unknown) {
  if (!(error instanceof ApiError)) return 'failed';
  if (error.code === 'LINK_REQUIRED') return 'link_required';
  if (error.code === 'ALREADY_LINKED') return 'already_linked';
  return 'failed';
}

async function completeOAuth(db: Database, config: Config, c: AppContext, provider: Provider) {
  const social = config.social;
  const destination=social?.publicUrl??config.origins[0];
  try {
    if(!social || !providerEnabled(social, provider)) throw new Error('Disabled');
    const pending = await consumeOAuthState(db, config, c, provider);
    await validateOAuthLink(db, config, c, pending);
    if(c.req.query('error')) return c.redirect(`${destination}/?oauth_error=cancelled`);
    const code=c.req.query('code');if(!code) throw new Error('Missing code');
    const token=await exchange(social,provider,{code,grant_type:'authorization_code',redirect_uri:`${social.publicUrl}/api/auth/${provider}/callback`,code_verifier:pending.verifier});
    const identity = await readProviderIdentity(social, provider, token, pending.nonce, config.production);
    await validateOAuthLink(db, config, c, pending); // Session may have been revoked during the provider requests.
    const userId = await connectIdentity(db, social, provider, pending, identity, token);
    if(!pending.user_id) await startSession(db,config,c,await readUser(db,userId));
    return c.redirect(`${destination}/?oauth=${provider}-${pending.user_id?'connected':'login'}`);
  } catch(err) {
    const reason = oauthFailureReason(err);
    return c.redirect(`${destination}/?oauth_error=${reason}`);
  }
}

async function beginOAuth(db: Database, config: Config, c: AppContext, provider: Provider, link: boolean) {
  const social = config.social;
  await parseBody(c,z.object({}));
  if(!social || !providerEnabled(social, provider)) throw new ApiError(503,'PROVIDER_DISABLED','ยังไม่ได้ตั้งค่าการเชื่อมต่อบริการนี้');
  // Keep the browser, cookie, and registered redirect URI on the same canonical host.
  if(c.req.header('origin')&&c.req.header('origin')!==social.publicUrl) throw new ApiError(400,'OAUTH_ORIGIN','กรุณาเปิดเว็บผ่าน '+social.publicUrl);
  const state=random(),browser=random(),verifier=random(),nonce=random();
  await db.prepare('DELETE FROM oauth_states WHERE expires_at<=?').run(now());
  await db.prepare('INSERT INTO oauth_states(state_hash,provider,browser_hash,user_id,session_id,verifier,nonce,expires_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(digest(state),provider,digest(browser),link?c.get('user').id:null,link?c.get('sessionId'):null,verifier,nonce,new Date(Date.now()+600000).toISOString());
  setCookie(c,`taskflow_oauth_${provider}`,browser,{httpOnly:true,secure:!!config.production,sameSite:'Lax',path:`/api/auth/${provider}`,maxAge:600});
  const url=new URL(provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://github.com/login/oauth/authorize');
  const params:Record<string,string>={client_id:social[provider]!.clientId,redirect_uri:`${social.publicUrl}/api/auth/${provider}/callback`,state,response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'};
  if(provider==='google') Object.assign(params,{scope:'openid email profile',nonce,prompt:'select_account'});
  else params.scope='offline_access';
  url.search=new URLSearchParams(params).toString();return c.json({url:url.toString()});
}

export function socialRoutes(db:Database,config:Config) {
  const routes=new Hono<Env>(),authenticate=sessionMiddleware(db,config),social=config.social;
  const enabled = (provider: Provider) => providerEnabled(social, provider);
  routes.get('/providers',c=>c.json({google:enabled('google'),github:enabled('github')}));
  routes.get('/connections',authenticate,async c=>c.json({accounts:await all(db,'SELECT provider,login,updated_at FROM connected_accounts WHERE user_id=?',c.get('user').id),google:enabled('google'),github:enabled('github'),install_url:social?.github?.slug?`https://github.com/apps/${social.github.slug}/installations/new`:'https://github.com/settings/installations'}));
  routes.delete('/connections/github',authenticate,async c=>{await db.prepare("DELETE FROM connected_accounts WHERE user_id=? AND provider='github'").run(c.get('user').id);return c.body(null,204);});
  routes.post('/google/start',c=>beginOAuth(db, config, c,'google',false));
  routes.post('/google/link',authenticate,c=>beginOAuth(db, config, c,'google',true));
  routes.post('/github/start',authenticate,c=>beginOAuth(db, config, c,'github',true));
  for (const provider of ['google', 'github'] as const) {
    routes.get(`/${provider}/callback`, c => completeOAuth(db, config, c, provider));
  }
  return routes;
}
