import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseChartEvidence} from './chart-data.mjs';
import {verifyNativeChartPackage} from './chart-package-client.mjs';
async function json(file){const s=await fs.stat(file);if(s.size>8*1024*1024) throw new Error('CHART_INPUT_BOUND');return JSON.parse(await fs.readFile(file,'utf8'));}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try {
    const [command,...args]=process.argv.slice(2);
    if(command==='parse'&&args.length===2) console.log(JSON.stringify(parseChartEvidence(await json(args[0]),await json(args[1])),null,2));
    else if(command==='verify'&&args.length===4)console.log(JSON.stringify(verifyNativeChartPackage(args[0],await json(args[1]),await json(args[2]),await json(args[3])),null,2));
    else if(command==='fixture'&&args.length===1) {const {exportEngineeringFixture}=await import('./chart-fixture-export.mjs');console.log(JSON.stringify(await exportEngineeringFixture(path.resolve(args[0])),null,2));}
    else throw new Error('Usage: chart-cli.mjs parse RAW SOURCES | verify PPTX RAW SOURCES MANIFEST | fixture NEW_OUTPUT_DIRECTORY');
  } catch(e){console.error(e.stack);process.exitCode=1;}
}
