import {isAbsolute,resolve,join,basename,dirname} from 'node:path';
import {receiveSourceWorkerEvidence,receiveSourceBuildWorkerInput,validateSourceBuildRegistry} from './source-worker-evidence.mjs';
const absolute=p=>typeof p==='string'&&isAbsolute(p)&&resolve(p)===p&&!/[\0\r\n]/u.test(p);
const ref=r=>r&&absolute(r.path)&&Number.isSafeInteger(r.bytes)&&r.bytes>=0&&/^[a-f0-9]{64}$/u.test(r.sha256??'');
const same=(a,b)=>a?.path===b?.path&&a?.bytes===b?.bytes&&a?.sha256===b?.sha256;
/** Read the original fixed build operation. Never qualifies products or grants replay. */
export function receiveSourcePublicationBuildWorker(request){
 if(request?.kind!=='npm.source-build-worker.receiving.v1'||!absolute(request.scratch)||Object.keys(request).some(k=>!['kind','scratch','input','request'].includes(k)))throw new TypeError('typed fixed build receiving request required');
 const home=join(request.scratch,'build-home'),input=receiveSourceBuildWorkerInput(home,request.input),v=input.value;
 if(v?.kind!=='npm.source-build-worker.input.v1'||v.profile!=='live-parent'||v.scratch!==request.scratch||!absolute(v.directory)||!absolute(v.program)||!ref(v.gate)||basename(v.gate.path)!=='publish-package.mjs'||basename(dirname(v.gate.path))!=='scripts'||!ref(v.manifest)||v.manifest.path!==join(v.directory,'package.json')||typeof v.registry!=='string'||!/^https?:\/\//u.test(v.registry)||v.cacheRoot!==null&&!absolute(v.cacheRoot)||!Number.isSafeInteger(v.timeout)||v.timeout<1||v.timeout>300000||v.maxBuffer!==16*1024*1024)throw new TypeError('fixed build input profile differs');
 validateSourceBuildRegistry(v.registry);
 const result=receiveSourceWorkerEvidence({directory:join(home,'worker-evidence'),request:request.request}),i=result.invocation;
 const args=[v.gate.path,'--qualify-build','--package',v.directory,'--registry',v.registry,...(v.cacheRoot===null?[]:['--qualification-cache-root',v.cacheRoot])];
 if(!same(i.input,input.reference)||i.program!==v.program||i.cwd!==v.scratch||i.timeout!==v.timeout||i.maxBuffer!==v.maxBuffer||JSON.stringify(i.arguments)!==JSON.stringify(args))throw new TypeError('original worker does not bind fixed build operation');
 // Recheck the bounded input after receiving the terminal chain; no path inside
 // the input is followed or opened by this operation.
 receiveSourceBuildWorkerInput(home,request.input);
 return Object.freeze({kind:'npm.source-build-worker.receiving-result.v1',state:result.state,reason:result.reason,input:input.reference,worker:result,semanticReceiving:false,qualifiedProducts:false,replayPermitted:false,signalAuthority:'none'});
}
