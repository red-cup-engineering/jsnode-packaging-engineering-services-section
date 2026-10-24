// Test-only receiving checks; original PNPM transport admission remains the owner.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {receiveNativeTransportEnvironment} from '../src/native-metadata-session.mjs';
import {hash,regular} from '../src/native-provider.mjs';
const proxies=['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy',
 'npm_config_proxy','npm_config_http_proxy','npm_config_https_proxy','NPM_CONFIG_PROXY','NPM_CONFIG_HTTP_PROXY','NPM_CONFIG_HTTPS_PROXY'];
const stable=['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','NO_PROXY','no_proxy','npm_config_noproxy','NPM_CONFIG_NOPROXY'];
export async function receiveCITransport(input,home){
 try{
  const selected={PATH:input.PATH,HOME:home},policy={stable:{},relays:{}};
  for(const key of [...proxies,...stable])if(input[key]!==undefined)selected[key]=input[key];
  for(const [key,value] of Object.entries(selected)){
   if(proxies.includes(key)){
    const url=new URL(value);policy.relays[key]={protocol:url.protocol,hostnameSHA256:hash(url.hostname)};
   }else policy.stable[key]=hash(value);
  }
  const received=receiveNativeTransportEnvironment(selected,policy);
  const files={};for(const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE'])
   if(received.values[key])files[key]=hash(await regular(received.values[key],1048576));
  const values={...received.values};
  // A typed CI control, not a repair or reinterpretation of old metadata profiles.
  if(input.NODE_USE_ENV_PROXY!==undefined){assert.ok(['0','1'].includes(input.NODE_USE_ENV_PROXY));values.NODE_USE_ENV_PROXY=input.NODE_USE_ENV_PROXY;}
  return {values,identity:{...received.identity,files,nodeUseEnvProxy:input.NODE_USE_ENV_PROXY??null}};
 }catch{throw new TypeError('unqualified native CI transport; no command issued');}
}
export function receiveRequiredTests(root,files){
 assert.ok(Array.isArray(files)&&files.length>0);assert.equal(new Set(files).size,files.length);
 for(const file of files){assert.match(file,/^test\/[a-z0-9-]+\.test\.mjs$/);readFileSync(join(root,file));}
 return files;
}
export function receiveProcess(result){
 assert.equal(result.error,undefined,'command failed to start/complete');assert.equal(result.signal,null,'command signalled');
 assert.equal(result.status,0,'command failed; inspect retained output');return result.stdout;
}
export function receiveSuite(tap,optional){
 const skipped=[...tap.matchAll(/^ok \d+ - (.*?) # SKIP.*$/gm)].map(m=>m[1]);
 assert.deepEqual(skipped,optional,'unexplained or missing optional enrollment');
 const number=k=>Number(tap.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]);
 assert.equal(number('fail'),0);assert.equal(number('cancelled'),0);assert.equal(number('skipped'),skipped.length);
 assert.ok(number('pass')>0&&number('tests')===number('pass')+skipped.length);
 return {tests:number('tests'),passed:number('pass'),skipped,outputSHA256:hash(tap)};
}
export function receiveArchive(members,manifest){
 for(const file of [...manifest.receivingTests,...Object.values(manifest.exports)])
  assert.ok(members.includes('package/'+file.replace(/^\.\//,'')),'missing actual archive member '+file);
 assert.ok(!members.some(p=>p.includes('/node_modules/')),'test tool must not be packed');
 return members;
}
