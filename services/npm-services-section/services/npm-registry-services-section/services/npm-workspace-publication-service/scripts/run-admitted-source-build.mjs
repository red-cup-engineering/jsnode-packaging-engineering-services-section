#!/usr/bin/env node
// Fixed program selected by the original NodeJob declaration. The sole argument
// is its authored private state root; request identity comes from that provider.
import {executeAdmittedSourcePublicationBuild} from '../src/source-build-qualification.mjs';
if(process.argv.length!==3)throw new TypeError('original fixed build state root required');
const result=await executeAdmittedSourcePublicationBuild({root:process.argv[2],request:{
  id:process.env.NODE_JOB_REQUEST_ID,digest:process.env.NODE_JOB_REQUEST_DIGEST}});
process.stdout.write(JSON.stringify(result)+'\n');
