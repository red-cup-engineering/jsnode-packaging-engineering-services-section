#!/usr/bin/env node
import {readFile,writeFile,lstat} from "node:fs/promises";
import {isAbsolute,relative,resolve,sep} from "node:path";
import {produceNativePackageProgramme} from "../src/produce-native-package-programme.mjs";
const [input,output,...extra]=process.argv.slice(2);
if(!input||!output||extra.length||!isAbsolute(output))throw new TypeError("expected one native programme input JSON and an absolute create-only receiving path");
const selection=JSON.parse(await readFile(input,"utf8"));
const within=(root,file)=>{const p=relative(resolve(root),resolve(file));return p===""||(!isAbsolute(p)&&p!==".."&&!p.startsWith(".."+sep));};
if(within(selection.destination,output)||within(selection.incumbent.runtimeRoot,output))throw new TypeError("receiving path must be independent of product and provider inputs");
try{await lstat(output);throw new TypeError("receiving path already exists");}catch(error){if(error.code!=="ENOENT")throw error;}
const product=await produceNativePackageProgramme(selection);
await writeFile(output,JSON.stringify(product,null,2)+"\n",{flag:"wx",mode:0o600});
console.log(JSON.stringify({kind:product.kind,sourceCommit:product.sourceCommit,programme:product.programme,dependencyPayloadCopied:false,machineReceivingRequired:true,receiving:output}));
