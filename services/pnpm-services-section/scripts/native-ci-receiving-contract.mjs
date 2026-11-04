// Test-only receiving checks; original PNPM transport admission remains the owner.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync,openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {join,resolve,isAbsolute,dirname} from 'node:path';
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
export function receiveNativeProductSuite(tap,expectedNames){
 assert.ok(Array.isArray(expectedNames)&&expectedNames.length===10,'ten native product cases required');
 assert.ok(expectedNames.every(name=>typeof name==='string'&&name.length>0&&!/[\r\n#]/.test(name)));
 assert.equal(new Set(expectedNames).size,expectedNames.length,'native product case names must be unique');
 assert.equal(typeof tap,'string');assert.ok(tap.endsWith('\n'),'incomplete native product TAP');
 const lines=tap.replace(/\r\n/g,'\n').split('\n');
 assert.equal(lines[0],'TAP version 13','native product TAP header required');
 assert.equal(lines.filter(line=>line==='TAP version 13').length,1);
 assert.ok(!lines.some(line=>/^\s*(?:not ok\b|Bail out!)/i.test(line)),'native product TAP refused');
 assert.ok(!lines.some(line=>/\s#\s*(?:SKIP|TODO)\b/i.test(line)),'native product cases cannot skip or remain TODO');
 let diagnostic=false;
 for(let i=1;i<lines.length;i++){
  const line=lines[i];
  if(line==='  ---'){assert.equal(diagnostic,false);assert.match(lines[i-1],/^ok \d+ - /);diagnostic=true;continue;}
  if(line==='  ...'){assert.equal(diagnostic,true);diagnostic=false;continue;}
  if(diagnostic){assert.match(line,/^ {2}\S/);continue;}
  assert.ok(line===''||line.startsWith('#')||/^ok \d+ - /.test(line)||/^\d+\.\.\d+$/.test(line),'unrecognized native product TAP');
 }
 assert.equal(diagnostic,false,'incomplete native product diagnostic');
 const points=lines.filter(line=>/^\s*(?:ok|not ok)\b/.test(line));
 assert.deepEqual(points,expectedNames.map((name,i)=>'ok '+(i+1)+' - '+name),'native product cases must match exactly');
 const plans=lines.filter(line=>/^\s*\d+\.\./.test(line));
 assert.deepEqual(plans,['1..'+expectedNames.length],'complete native product plan required');
 const planIndex=lines.indexOf(plans[0]);
 assert.ok(planIndex>lines.indexOf(points.at(-1)),'native product plan must follow all results');
 for(const [key,value] of Object.entries({tests:10,suites:0,pass:10,fail:0,cancelled:0,skipped:0,todo:0})){
  const rows=lines.filter(line=>new RegExp('^# '+key+'\\b').test(line));
  assert.deepEqual(rows,['# '+key+' '+value],'native product '+key+' summary differs');
  assert.ok(lines.indexOf(rows[0])>planIndex,'native product summary must follow the complete plan');
 }
 const durations=lines.filter(line=>/^# duration_ms\b/.test(line));
 assert.equal(durations.length,1);assert.match(durations[0],/^# duration_ms \d+(?:\.\d+)?$/);
 assert.equal(lines.at(-2),durations[0],'native product TAP must end with its duration summary');
 return {tests:10,passed:10,names:[...expectedNames],outputSHA256:hash(tap)};
}
// Failure evidence only: fixed fixture paths and numeric projections never admit
// a supplier, publish raw native text or its guessable fingerprints, or replace
// the original command failure. Raw-derived identities belong in private custody.
export function receiveNativeFailureDiagnostics(qualificationState){
 const bounds={fixtureDirectories:9,files:19,maxReceiptBytes:512*1024,maxLogBytes:256*1024,
  maxLinesPerLog:2048,maxLineBytes:32*1024,maxAdmissionRecords:32,maxOutputBytes:32*1024};
 const report={version:1,state:'diagnostics-only',view:'public-safe-projection',rawLogs:'retained-locally-not-published-by-this-projection',
  omittedContent:['raw-text','requests','commands','paths','environment','unrecognized-fields'],
  qualificationStateStatus:'unsafe',bounds,receipt:{status:'not-read'},fixtures:[],truncated:false,outputTruncated:false,omittedFixtures:0};
 const failureStatus=error=>['ENOENT','ENOTDIR'].includes(error?.code)?'missing':'unreadable';
 const directoryStatus=path=>{
  try{return lstatSync(path).isDirectory()&&realpathSync(path)===path?'available':'unsafe';}
  catch(error){return failureStatus(error);}
 };
 if(typeof qualificationState!=='string'||!isAbsolute(qualificationState)||resolve(qualificationState)!==qualificationState)return report;
 report.qualificationStateStatus=directoryStatus(qualificationState);
 if(report.qualificationStateStatus!=='available')return report;
 function evidence(path,limit){
  let fd;
  try{
   const parent=directoryStatus(dirname(path));if(parent!=='available')return {identity:{status:parent}};
   const before=lstatSync(path);
   if(!before.isFile()||before.nlink!==1||realpathSync(path)!==path||!Number.isSafeInteger(before.size)||before.size<0)return {identity:{status:'unsafe'}};
   fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   const held=fstatSync(fd);
   if(!held.isFile()||held.dev!==before.dev||held.ino!==before.ino||held.size!==before.size)return {identity:{status:'changed'}};
   const bytes=Buffer.alloc(Math.min(held.size,limit));let offset=0;
   while(offset<bytes.length){const count=readSync(fd,bytes,offset,bytes.length-offset,null);if(count===0)break;offset+=count;}
   const after=fstatSync(fd),current=lstatSync(path);
   if(offset!==bytes.length||after.size!==held.size||after.mtimeMs!==held.mtimeMs||current.dev!==held.dev||current.ino!==held.ino||realpathSync(path)!==path)return {identity:{status:'changed'}};
   const truncated=held.size>limit;report.truncated ||= truncated;
   return {identity:{status:truncated?'truncated':'complete',fileBytes:held.size,readBytes:offset,
    truncated},bytes};
  }catch(error){return {identity:{status:error?.code==='ELOOP'?'unsafe':failureStatus(error)}};}
  finally{if(fd!==undefined)try{closeSync(fd);}catch{}}
 }
 const cacheKeys=['byteLimit','retainedBytes','peakRetainedBytes','pendingEntries','peakPendingEntries','settledEntries','evictions','oversizedEntries','rejectedEntries'];
 const admissionKeys=['selectedConcurrency','maximumActive','checked'];
 const validNumber=value=>Number.isSafeInteger(value)&&value>=0;
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 function numericProjection(input,keys,maximum=false,target={}){
  let invalidFields=0;
  for(const key of keys)if(Object.hasOwn(input,key)){
   if(validNumber(input[key]))target[key]=maximum?Math.max(target[key]??0,input[key]):input[key];else invalidFields++;
  }
  return {metrics:target,invalidFields};
 }
 const eventCounter=eventName=>({eventName,observations:0,maxima:{},invalidFields:0});
 function eventProjection(input){
  const projected={linesObserved:0,malformedLines:0,oversizedLines:0,truncated:false,
   cache:eventCounter('pnpm:metadata-cache-retention'),admission:eventCounter('pnpm:lockfile-verification-admission')};
  if(!input.bytes)return projected;
  let text=input.bytes.toString('utf8');
  if(input.identity.truncated){text=text.slice(0,Math.max(0,text.lastIndexOf('\n')));projected.truncated=true;}
  const lines=text.split('\n');projected.truncated ||= lines.length>bounds.maxLinesPerLog;
  for(const line of lines.slice(0,bounds.maxLinesPerLog)){
   if(!line)continue;projected.linesObserved++;
   if(Buffer.byteLength(line)>bounds.maxLineBytes){projected.oversizedLines++;continue;}
   let row;try{row=JSON.parse(line);}catch{projected.malformedLines++;continue;}
   if(!object(row)){projected.malformedLines++;continue;}
   const target=row.name===projected.cache.eventName?projected.cache:row.name===projected.admission.eventName?projected.admission:null;
   if(!target)continue;target.observations++;
   target.invalidFields+=numericProjection(row,target===projected.cache?cacheKeys:admissionKeys,true,target.maxima).invalidFields;
  }
  report.truncated ||= projected.truncated;return projected;
 }
 const receiptInput=evidence(join(qualificationState,'native-receiving.json'),bounds.maxReceiptBytes);
 report.receipt={...receiptInput.identity,formatStatus:'not-parsed',recordsObserved:0,recordsTruncated:false,unmatchedRecords:0};
 let rows=[];
 if(receiptInput.identity.status==='complete'){
  try{
   const parsed=JSON.parse(receiptInput.bytes.toString('utf8'));
   if(!object(parsed)||!Array.isArray(parsed.received))report.receipt.formatStatus='malformed';
   else{rows=parsed.received.slice(0,bounds.fixtureDirectories);report.receipt.formatStatus='parsed';report.receipt.recordsObserved=rows.length;
    report.receipt.recordsTruncated=parsed.received.length>bounds.fixtureDirectories;report.truncated ||= report.receipt.recordsTruncated;}
  }catch{report.receipt.formatStatus='malformed';}
 }
 const signals=['SIGABRT','SIGKILL','SIGTERM','SIGSEGV','SIGBUS','SIGILL','SIGTRAP','SIGINT','SIGHUP','SIGPIPE','SIGXCPU','SIGXFSZ'];
 const fixtures=['bounded','dedup','oversize','rejection','young','integrity','url','revision','trust'];
 const matched=new Set();
 for(const [index,fixture] of fixtures.entries()){
  const sequence=index+1,directory=join(qualificationState,'fixture-'+sequence+'-'+fixture);
  const found=rows.flatMap((row,i)=>object(row)&&row.label===fixture&&row.root===directory?[i]:[]);
  const received={status:found.length===1?'partial-observations':found.length>1?'ambiguous':'missing'};
  for(const i of found)matched.add(i);
  if(found.length===1){
   const row=rows[found[0]],exitCode=Number.isSafeInteger(row.code)&&row.code>=0&&row.code<=255?row.code:null;
   const signal=row.signal===null?null:signals.includes(row.signal)?row.signal:null;
   received.terminal={exitCode,signal,invalidFields:Number(exitCode===null)+Number(row.signal!==null&&!signals.includes(row.signal))};
   const metrics=numericProjection(row,['maximumHTTPActive','cacheEvents','maximumRetainedBytes','oversized','rejected']);
   received.metrics=metrics.metrics;received.invalidFields=metrics.invalidFields;
   received.admission={observations:0,maxima:{},invalidFields:0,truncated:false};
   if(Array.isArray(row.admission)){
    received.admission.truncated=row.admission.length>bounds.maxAdmissionRecords;
    for(const entry of row.admission.slice(0,bounds.maxAdmissionRecords)){
     if(!object(entry)){received.admission.invalidFields++;continue;}
     received.admission.observations++;
     received.admission.invalidFields+=numericProjection(entry,admissionKeys,true,received.admission.maxima).invalidFields;
    }
    report.truncated ||= received.admission.truncated;
   }else received.admission.invalidFields++;
  }
  const stdout=evidence(join(directory,'native.stdout'),bounds.maxLogBytes),stderr=evidence(join(directory,'native.stderr'),bounds.maxLogBytes);
  const classifications=[];
  if(stderr.bytes){
   const text=stderr.bytes.toString('utf8');
   for(const token of ['ERR_PNPM_META_FETCH_FAIL','ERR_PNPM_FETCH_500','ERR_PNPM_FETCH_404','ERR_PNPM_TRUST_DOWNGRADE','ERR_PNPM_MISSING_TARBALL_INTEGRITY'])
    if(new RegExp('\\b'+token+'\\b').test(text))classifications.push(token);
   if(/FATAL ERROR: (?:Reached heap limit|Ineffective mark-compacts near heap limit)|JavaScript heap out of memory/.test(text))classifications.push('NODE_HEAP_EXHAUSTION');
  }
  report.fixtures.push({fixture,sequence,receipt:received,stdout:{evidence:stdout.identity,events:eventProjection(stdout)},stderr:{evidence:stderr.identity,classifications}});
 }
 report.receipt.unmatchedRecords=rows.length-matched.size;
 while(Buffer.byteLength(JSON.stringify(report))>bounds.maxOutputBytes&&report.fixtures.length){report.fixtures.pop();report.omittedFixtures++;report.outputTruncated=true;report.truncated=true;}
 return report;
}
export function emitNativeFailureDiagnostics(qualificationState,outer={},emit=value=>console.error(JSON.stringify(value))){
 const report=receiveNativeFailureDiagnostics(qualificationState),limit=report.bounds.maxLogBytes;
 function boundedText(value){
  if(typeof value!=='string')return {identity:{status:'malformed'}};
  const selected=value.slice(0,limit),encoded=Buffer.from(selected),bytes=encoded.subarray(0,limit);
  const truncated=value.length>selected.length||encoded.length>limit;
  report.truncated ||= truncated;
  return {identity:{status:truncated?'truncated':'complete',availableCodeUnits:value.length,readBytes:bytes.length,
   truncated},text:bytes.toString('utf8')};
 }
 const stdout=boundedText(outer?.stdout),stderr=boundedText(outer?.stderr),terminal=outer?.terminal;
 const exitCode=Number.isSafeInteger(terminal?.status)&&terminal.status>=0&&terminal.status<=255?terminal.status:null;
 const signals=['SIGABRT','SIGKILL','SIGTERM','SIGSEGV','SIGBUS','SIGILL','SIGTRAP','SIGINT','SIGHUP','SIGPIPE','SIGXCPU','SIGXFSZ'];
 const signal=signals.includes(terminal?.signal)?terminal.signal:null;
 const errorCode=['ETIMEDOUT','ENOBUFS','ENOENT','EACCES','ENOEXEC'].includes(terminal?.error?.code)?terminal.error.code:null;
 const refusalClass=errorCode==='ETIMEDOUT'?'timeout':errorCode==='ENOBUFS'?'output-limit':signal?'signalled':terminal?.error?'command-error':exitCode===null?'incomplete-terminal':exitCode!==0?'nonzero-exit':'receiving-refused';
 const tap={counters:{},invalidCounters:0,passedResultsObserved:0,failedResultsObserved:0,truncated:false};
 if(stdout.text!==undefined){
  let selected=stdout.text;if(stdout.identity.truncated)selected=selected.slice(0,Math.max(0,selected.lastIndexOf('\n')));
  const allLines=selected.split('\n'),lines=allLines.slice(0,report.bounds.maxLinesPerLog);
  tap.truncated=stdout.identity.truncated||allLines.length>lines.length;report.truncated ||= tap.truncated;
  for(const key of ['tests','suites','pass','fail','cancelled','skipped','todo']){
   const rows=lines.filter(line=>new RegExp('^# '+key+'\\b').test(line));
   if(rows.length===0)continue;
   const match=rows.length===1?rows[0].match(new RegExp('^# '+key+' (\\d+)$')):null;
   if(match&&Number.isSafeInteger(Number(match[1])))tap.counters[key]=Number(match[1]);else tap.invalidCounters++;
  }
  tap.passedResultsObserved=lines.filter(line=>/^ok \d+ - /.test(line)).length;
  tap.failedResultsObserved=lines.filter(line=>/^not ok \d+ - /.test(line)).length;
 }
 report.outer={stage:'native-product-source-tests',refusalClass,terminal:{exitCode,signal,errorPresent:Boolean(terminal?.error),errorCode,
  invalidFields:Number(exitCode===null)+Number(terminal?.signal!==null&&!signals.includes(terminal?.signal))},
  stdout:{evidence:stdout.identity,tap},stderr:{evidence:stderr.identity},rawOutput:'retained-locally-not-published-by-this-projection'};
 while(Buffer.byteLength(JSON.stringify(report))>report.bounds.maxOutputBytes&&report.fixtures.length){report.fixtures.pop();report.omittedFixtures++;report.outputTruncated=true;report.truncated=true;}
 emit(report);return report;
}
// Reuse the bounded process projection without entering native-fixture custody.
// Stage identity is a fixed owner allowlist, never arbitrary error/output text.
export function emitCIFailureDiagnostics(stage,outer={},emit=value=>console.error(JSON.stringify(value))){
 const projected=emitNativeFailureDiagnostics(undefined,outer,()=>{});
 const stages=['receiving-contract-tests','source-tests','native-pack','archive-members','consumer-lock','consumer-install','installed-tests'];
 const {maxLogBytes,maxLinesPerLog,maxOutputBytes}=projected.bounds;
 const report={version:1,state:'diagnostics-only',view:'public-safe-projection',
  bounds:{maxLogBytes,maxLinesPerLog,maxOutputBytes},omittedContent:projected.omittedContent,
  outer:{...projected.outer,stage:stages.includes(stage)?stage:'unknown-ci-stage'},truncated:projected.truncated};
 emit(report);return report;
}
export function receiveArchive(members,manifest){
 for(const file of [...manifest.receivingTests,...Object.values(manifest.exports)])
  assert.ok(members.includes('package/'+file.replace(/^\.\//,'')),'missing actual archive member '+file);
 assert.ok(!members.some(p=>p.includes('/node_modules/')),'test tool must not be packed');
 return members;
}
