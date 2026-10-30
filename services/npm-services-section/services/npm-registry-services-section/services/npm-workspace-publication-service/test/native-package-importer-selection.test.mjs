import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createInstalledContractReader} from '../src/installed-contract-owner.mjs';
// Synthetic filesystem qualification of original native provider selection;
// no package-manager operation or successful factory receiving is claimed.
test('original importer owner selects nested version rather than root-name decoy',async t=>{
 const root=await mkdtemp(join(tmpdir(),'factory-importer-selection-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'package.json'),JSON.stringify({name:'root',version:'1.0.0'}));
 const sdk=join(root,'node_modules/sdk'),nested=join(sdk,'node_modules/dependency'),decoy=join(root,'node_modules/dependency');
 for(const [path,name,version]of [[sdk,'sdk','1.0.0'],[nested,'dependency','0.8.11'],[decoy,'dependency','1.2.3']]){await mkdir(path,{recursive:true});await writeFile(join(path,'package.json'),JSON.stringify({name,version,main:'index.js'}));await writeFile(join(path,'index.js'),'module.exports = 1;\n');}
 const reader=createInstalledContractReader({root,installation:join(root,'node_modules')}),importer=join(sdk,'index.js');
 assert.equal(reader.owner(importer).name,'sdk');assert.equal(reader.provider('dependency',importer,join(nested,'index.js')).version,'0.8.11');
 assert.throws(()=>reader.provider('dependency',importer,join(decoy,'index.js')),/leaves its native-selected/);
 assert.equal(reader.provider('dependency',join(root,'package.json'),join(decoy,'index.js')).version,'1.2.3');
});
