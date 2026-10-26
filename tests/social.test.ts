import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../apps/api/src/app.ts';
import {openDatabase} from '../apps/api/src/db.ts';
import {seal,unseal,socialFromEnvironment} from '../apps/api/src/social-config.ts';
import {digest} from '../apps/api/src/social.ts';
const origin='http://localhost:5173',secret='social-test-secret-longer-than-32-characters',key='12'.repeat(32);
function fixture(t:import('node:test').TestContext){
  const db=openDatabase(':memory:');t.after(()=>db.close());const calls:{url:string;method:string;body:any;authorization:string|null}[]=[];
  let google={sub:'google-1',email:'new@example.com',name:'Google Person'},github={id:123,login:'developer'},refreshes=0;
  const fakeFetch=(async(input:any,options:any={})=>{
    const url=String(input),method=options.method??'GET';calls.push({url,method,body:options.body,authorization:new Headers(options.headers).get('Authorization')});
    if(url.includes('access_token')||url.includes('googleapis.com/token')){
      if(String(options.body).includes('refresh_token'))refreshes++;
      return Response.json({access_token:'private-access',refresh_token:'private-refresh',expires_in:3600,id_token:'signed-google-token'});
    }
    if(url==='https://api.github.com/user')return Response.json(github);
    if(method==='POST')return new Response(null,{status:204});
    if(url.includes('/contents/'))return Response.json({type:'file',name:'README.md',path:'README.md',size:5,encoding:'base64',content:Buffer.from('hello').toString('base64')});
    if(url.includes('/commits/')&&url.includes('/check-runs'))return Response.json({check_runs:[],total_count:0});
    if(url.includes('/actions/runs/')&&url.includes('/jobs'))return Response.json({jobs:[{id:1,name:'test',steps:[{name:'unit tests',conclusion:'success'}]}],total_count:1});
    return Response.json({installations:[{id:8,account:{login:'developer'}}],total_count:1});
  }) as typeof fetch;
  const app=createApp(db,{secret,origins:[origin],silent:true,authLimit:200,social:{publicUrl:origin,google:{clientId:'google-client',clientSecret:'google-secret'},github:{clientId:'github-client',clientSecret:'github-secret',slug:'taskflow-test'},tokenKey:key,fetch:fakeFetch,verifyGoogle:async(token,nonce)=>{assert.equal(token,'signed-google-token');assert.ok(nonce);return google;}}});
  async function register(email='owner@example.com'){
    const response=await app.request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Existing owner',email,password:'Password-2026!'})});assert.equal(response.status,201);return {cookie:response.headers.get('set-cookie')!.split(';')[0],user:(await response.json()).user};
  }
  const request=(path:string,cookie='',method='GET',body?:any,requestOrigin=origin)=>app.request(path,{method,headers:{cookie,origin:requestOrigin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  async function start(provider='google',cookie='',link=false){
    const response=await request(`/api/auth/${provider}/${link?'link':'start'}`,cookie,'POST',{});assert.equal(response.status,200);
    const url=new URL((await response.json()).url),browser=response.headers.get('set-cookie')!.split(';')[0];
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),`${origin}/api/auth/${provider}/callback`);
    return {url,browser,callback:`/api/auth/${provider}/callback?state=${url.searchParams.get('state')}&code=code`};
  }
  return {db,app,calls,register,request,start,setGoogle:(v:typeof google)=>google=v,setGithub:(v:typeof github)=>github=v,refreshes:()=>refreshes};
}
test('OAuth configuration and token encryption fail closed and bind ciphertext to its account',()=>{
  assert.throws(()=>socialFromEnvironment({GITHUB_CLIENT_ID:'x',GITHUB_CLIENT_SECRET:'y'}));
  assert.throws(()=>socialFromEnvironment({GOOGLE_CLIENT_ID:'x'}));
  assert.throws(()=>socialFromEnvironment({NODE_ENV:'production',APP_PUBLIC_URL:'http://example.com'}));
  const encrypted=seal('token',key,'owner');assert.notEqual(encrypted,'token');assert.equal(unseal(encrypted,key,'owner'),'token');
  assert.throws(()=>unseal(encrypted,key,'other'));assert.throws(()=>unseal(encrypted,'34'.repeat(32),'owner'));
});
test('Google login verifies browser state, creates an account once and never stores provider tokens',async t=>{
  const f=fixture(t),flow=await f.start();
  assert.equal((await f.request(flow.callback)).headers.get('location'),`${origin}/?oauth_error=failed`);
  const response=await f.request(flow.callback,flow.browser);assert.equal(response.status,302);assert.equal(response.headers.get('location'),`${origin}/?oauth=google-login`);
  assert.ok(response.headers.get('set-cookie')?.includes('taskflow_session='));
  const row=f.db.prepare("SELECT * FROM connected_accounts WHERE provider='google'").get()!;assert.equal(row.token_cipher,null);
  assert.equal((await f.request(flow.callback,flow.browser)).headers.get('location'),`${origin}/?oauth_error=failed`);
  const again=await f.start();await f.request(again.callback,again.browser);
  assert.equal(f.db.prepare('SELECT COUNT(*) count FROM users').get()!.count,1);
  assert.ok(!JSON.stringify(await (await f.request('/api/auth/providers')).json()).includes('secret'));
});
test('expired or mismatched OAuth states and disallowed origins cannot exchange a code',async t=>{
  const f=fixture(t),flow=await f.start();
  assert.equal((await f.request(flow.callback,'taskflow_oauth_google=wrong')).headers.get('location'),`${origin}/?oauth_error=failed`);
  f.db.prepare('UPDATE oauth_states SET expires_at=?').run('2000-01-01');
  assert.equal((await f.request(flow.callback,flow.browser)).headers.get('location'),`${origin}/?oauth_error=failed`);
  assert.equal(f.calls.length,0);
  assert.equal((await f.request('/api/auth/google/start','','POST',{},'https://evil.example')).status,403);
});
test('matching email requires explicit authenticated Google linking and preserves existing tasks',async t=>{
  const f=fixture(t),owner=await f.register();f.setGoogle({sub:'g-existing',email:owner.user.email,name:'Google Name'});
  const attempt=await f.start();assert.equal((await f.request(attempt.callback,attempt.browser)).headers.get('location'),`${origin}/?oauth_error=link_required`);
  assert.equal(f.db.prepare('SELECT COUNT(*) count FROM connected_accounts').get()!.count,0);
  const link=await f.start('google',owner.cookie,true);assert.equal((await f.request(link.callback,`${owner.cookie}; ${link.browser}`)).headers.get('location'),`${origin}/?oauth=google-connected`);
  assert.equal(f.db.prepare('SELECT user_id FROM connected_accounts').get()!.user_id,owner.user.id);
  assert.equal((await (await f.request('/api/auth/me',owner.cookie)).json()).user.name,'Existing owner');
  const other=await f.register('other@example.com'),conflict=await f.start('google',other.cookie,true);
  assert.equal((await f.request(conflict.callback,`${other.cookie}; ${conflict.browser}`)).headers.get('location'),`${origin}/?oauth_error=already_linked`);
});
test('GitHub connection needs the same active session and stores encrypted credentials, scoped per user',async t=>{
  const f=fixture(t);assert.equal((await f.request('/api/auth/github/start','','POST',{})).status,401);
  const owner=await f.register(),other=await f.register('other@example.com'),flow=await f.start('github',owner.cookie);
  assert.equal((await f.request(flow.callback,`${other.cookie}; ${flow.browser}`)).headers.get('location'),`${origin}/?oauth_error=failed`);
  const valid=await f.start('github',owner.cookie);await f.request(valid.callback,`${owner.cookie}; ${valid.browser}`);
  const row=f.db.prepare("SELECT * FROM connected_accounts WHERE provider='github'").get()!;
  assert.ok(!String(row.token_cipher).includes('private-access'));
  assert.equal(JSON.parse(unseal(String(row.token_cipher),key,owner.user.id)).access_token,'private-access');
  const publicInfo=await (await f.request('/api/auth/connections',owner.cookie)).text();assert.ok(!publicInfo.includes('private-access'));assert.ok(!publicInfo.includes('token_cipher'));
  assert.equal((await f.request('/api/github/installations',other.cookie)).status,409);
  assert.equal((await f.request('/api/github/installations',owner.cookie)).status,200);
  assert.equal((await f.request('/api/auth/connections/github',owner.cookie,'DELETE')).status,204);
  assert.equal((await f.request('/api/github/installations',owner.cookie)).status,409);
});
test('revoked link sessions cannot persist a GitHub connection',async t=>{
  const f=fixture(t),owner=await f.register(),flow=await f.start('github',owner.cookie);
  f.db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=?').run(new Date().toISOString(),owner.user.id);
  assert.equal((await f.request(flow.callback,`${owner.cookie}; ${flow.browser}`)).headers.get('location'),`${origin}/?oauth_error=failed`);
  assert.equal(f.calls.length,0);
});
test('repository browsing and pipeline actions are authenticated, validate input and require explicit confirmation',async t=>{
  const f=fixture(t),owner=await f.register(),flow=await f.start('github',owner.cookie);await f.request(flow.callback,`${owner.cookie}; ${flow.browser}`);
  const root='/api/github/repos/owner/repository';
  assert.equal((await f.request(root+'/runs')).status,401);
  const file=await f.request(root+'/files?ref=main&path=README.md',owner.cookie);assert.equal((await file.json()).text,'hello');
  assert.equal((await f.request(root+'/files?ref=main&path=../secrets',owner.cookie)).status,400);
  assert.equal((await f.request(root+'/runs?page=-1',owner.cookie)).status,400);
  assert.equal((await f.request(root+'/workflows/42/dispatch',owner.cookie,'POST',{ref:'main'})).status,400);
  const before=f.calls.length;
  assert.equal((await f.request(root+'/runs/42/cancel',owner.cookie,'POST',{confirm:true},'https://evil.example')).status,403);assert.equal(f.calls.length,before);
  assert.equal((await f.request(root+'/workflows/42/dispatch',owner.cookie,'POST',{confirm:true,ref:'main',inputs:{target:'test'}})).status,200);
  const sent=f.calls.find(c=>c.url.endsWith('/dispatches'))!;assert.equal(sent.method,'POST');assert.deepEqual(JSON.parse(sent.body),{ref:'main',inputs:{target:'test'}});
  for(const action of ['rerun','cancel']) assert.equal((await f.request(root+`/runs/42/${action}`,owner.cookie,'POST',{confirm:true})).status,200);
  assert.equal((await f.request(root+'/runs/42/delete',owner.cookie,'POST',{confirm:true})).status,400);
  assert.equal(f.db.prepare('SELECT COUNT(*) count FROM pipeline_actions').get()!.count,3);
});
test('concurrent expired-token requests refresh once and never expose the refresh token',async t=>{
  const f=fixture(t),owner=await f.register(),flow=await f.start('github',owner.cookie);await f.request(flow.callback,`${owner.cookie}; ${flow.browser}`);
  f.db.prepare("UPDATE connected_accounts SET token_cipher=? WHERE user_id=? AND provider='github'").run(seal(JSON.stringify({access_token:'expired',refresh_token:'refresh',expires_at:1}),key,owner.user.id),owner.user.id);
  const responses=await Promise.all([f.request('/api/github/installations',owner.cookie),f.request('/api/github/installations',owner.cookie)]);
  responses.forEach(r=>assert.equal(r.status,200));assert.equal(f.refreshes(),1);
  assert.ok(f.calls.filter(c=>c.url.includes('/user/installations')).every(c=>c.authorization==='Bearer private-access'));
});
