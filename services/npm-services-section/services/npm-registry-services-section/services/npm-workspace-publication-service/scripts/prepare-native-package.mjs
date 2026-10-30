import {performNativePackagePreparation} from '../src/native-package-preparation.mjs';
if(process.argv.length!==4)throw new TypeError('fixed private package worker invocation required');
try{const result=await performNativePackagePreparation(process.argv[2],process.argv[3]);process.stdout.write(JSON.stringify(result.summary)+'\n');process.exitCode=result.accepted?0:2;}
catch{process.stderr.write('native package worker input or evidence refused\n');process.exitCode=2;}
