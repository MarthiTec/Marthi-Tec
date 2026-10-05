import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {test} from 'node:test';
test('API build removes obsolete SQL artifacts before copying approved migrations',()=>{
 const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));const command=pkg.scripts['build:api'].split('node -e "')[1].slice(0,-1);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'marthi-migration-sync-'));try{
 fs.mkdirSync(path.join(root,'apps/api/src/db/migrations'),{recursive:true});fs.mkdirSync(path.join(root,'dist/db/migrations'),{recursive:true});
 fs.writeFileSync(path.join(root,'apps/api/src/db/migrations/0051_current.sql'),'SELECT 1;');fs.writeFileSync(path.join(root,'dist/db/migrations/0018_deleted_seed.sql'),'DELETE FROM stores;');
 const r=spawnSync(process.execPath,['-e',command],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 assert.deepEqual(fs.readdirSync(path.join(root,'dist/db/migrations')),['0051_current.sql']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
