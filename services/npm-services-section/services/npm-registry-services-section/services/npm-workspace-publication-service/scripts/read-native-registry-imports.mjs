#!/usr/bin/env node
import {readNativeRegistryImports} from '../src/native-registry-imports.mjs';
const [root,encoded,...extra]=process.argv.slice(2);
if(!root||!encoded||extra.length)throw new TypeError('expected received carrier and declared Node entrances');
console.log(JSON.stringify(await readNativeRegistryImports({root,entrances:JSON.parse(encoded)})));

