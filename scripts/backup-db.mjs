import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const source=resolve(process.env.DATABASE_PATH??'./data/taskflow.sqlite');
if(!existsSync(source))throw new Error('Database not found');
const folder=resolve('backups');mkdirSync(folder,{recursive:true});
const destination=resolve(folder,`taskflow-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
const db=new DatabaseSync(source,{readOnly:true});
try{db.exec(`VACUUM INTO '${destination.replaceAll("'","''")}'`);}finally{db.close();}
const check=new DatabaseSync(destination,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed');}finally{check.close();}
console.log(`Backup verified: ${destination}`);
