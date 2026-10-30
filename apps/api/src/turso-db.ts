import {readFileSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createClient,type Transaction} from '@libsql/client';

type Params=(string|number|null|Uint8Array)[];

/** Asynchronous SQL adapter for Turso and local libSQL integration tests. */
export async function openTursoDatabase(url:string,authToken:string){
  if(!/^(libsql|https):\/\/[^/]+$/.test(url)&&!url.startsWith('file:'))throw new Error('TURSO_DATABASE_URL must be a libsql:// or https:// host');
  if(!authToken&&!url.startsWith('file:'))throw new Error('TURSO_AUTH_TOKEN is required');
  const client=createClient({url,authToken,intMode:'number'});
  const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
  await client.executeMultiple(schema.replace('PRAGMA journal_mode = WAL;',''));
  const columns=async(table:string)=>new Set((await client.execute(`PRAGMA table_info(${table})`)).rows.map(row=>String(row.name)));
  const users=await columns('users');
  for(const [name,definition] of Object.entries({nickname:"TEXT NOT NULL DEFAULT ''",phone:"TEXT NOT NULL DEFAULT ''",avatar:'BLOB',avatar_type:'TEXT',avatar_version:'TEXT',email_verified_at:'TEXT'})){
    if(!users.has(name))await client.execute(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
  const tasks=await columns('tasks');
  if(!tasks.has('project_id'))await client.execute('ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL');
  if(!tasks.has('assigned_to'))await client.execute('ALTER TABLE tasks ADD COLUMN assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(user_id,project_id,due_date)');
  const projects=await columns('projects');
  if(!projects.has('create_failure_tasks'))await client.execute('ALTER TABLE projects ADD COLUMN create_failure_tasks INTEGER NOT NULL DEFAULT 0');
  const active=new AsyncLocalStorage<Transaction>();
  const adapter={
    prepare(sql:string){
      return{
        async get(...args:Params){const result=await (active.getStore()??client).execute({sql,args});return result.rows[0] as Record<string,unknown>|undefined;},
        async all(...args:Params){const result=await (active.getStore()??client).execute({sql,args});return result.rows as Record<string,unknown>[];},
        async run(...args:Params){const result=await (active.getStore()??client).execute({sql,args});return{changes:result.rowsAffected};},
      };
    },
    async exec(sql:string){await client.executeMultiple(sql);},
    async transaction<T>(work:()=>Promise<T>){
      const tx=await client.transaction('write');
      try{const value=await active.run(tx,work);await tx.commit();return value;}
      catch(error){await tx.rollback();throw error;}
    },
    close(){client.close();},
  };
  return adapter;
}
export type TursoDatabase=Awaited<ReturnType<typeof openTursoDatabase>>;
