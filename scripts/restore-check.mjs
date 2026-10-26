import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,existsSync,constants} from 'node:fs';
import {resolve} from 'node:path';
const [sourceArg,destinationArg]=process.argv.slice(2);
if(!sourceArg||!destinationArg)throw new Error('Usage: npm.cmd run db:restore-check -- <backup.sqlite> <new-test-file.sqlite>');
const source=resolve(sourceArg),destination=resolve(destinationArg);
if(source===destination||!existsSync(source)||existsSync(destination))throw new Error('Source must exist; destination must be a new path');
const check=new DatabaseSync(source,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Source integrity check failed');}finally{check.close();}
copyFileSync(source,destination,constants.COPYFILE_EXCL);
const restored=new DatabaseSync(destination,{readOnly:true});try{if(restored.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Restored integrity check failed');console.log(`Restore copy verified: ${destination}`);}finally{restored.close();}
