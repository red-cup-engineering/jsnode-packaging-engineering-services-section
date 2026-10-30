import {performNativeMetadataWorker} from '../src/native-metadata-worker.mjs';
if(process.argv.length!==4)throw new TypeError('fixed private metadata worker invocation required');
try{
  const result=await performNativeMetadataWorker(process.argv[2],process.argv[3]);
  process.stdout.write(JSON.stringify(result.summary)+'\n');process.exitCode=result.accepted?0:2;
}catch{process.stderr.write('native metadata worker input or evidence refused\n');process.exitCode=2;}
