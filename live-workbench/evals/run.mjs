import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {loadOracle} from './oracle.mjs';
import {fileModelTransport} from './spool.mjs';
import {runSuite} from './runner.mjs';
import {suitePlan} from './scenarios.mjs';
const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
try{
 if(args.includes('--plan')){console.log(JSON.stringify({model:'claude-haiku-5-5',max_iterations:5,max_usd:10,runs:suitePlan()},null,2));}
 else{
  for(const flag of ['--seed','--manifest','--adapter','--approval','--spool','--out'])if(!args.includes(flag)||!get(flag))throw Error('Missing '+flag);
  const oracle=await loadOracle(resolve(get('--seed')),resolve(get('--manifest')));
  const approval=JSON.parse(await readFile(resolve(get('--approval')),'utf8'));
  const module=await import(pathToFileURL(resolve(get('--adapter'))));const adapter=await module.createAdapter({oracle});
  const system=await readFile(new URL('./system-prompt.txt',import.meta.url),'utf8');
  const reviewResults=args.includes('--reviews')?JSON.parse(await readFile(resolve(get('--reviews')),'utf8')):{};
  const report=await runSuite({oracle,adapter,approval,system,reviewResults,modelTransport:fileModelTransport(resolve(get('--spool'))),outputDir:resolve(get('--out')),priority:args.includes('--priority')?get('--priority').split(','):[],only:args.includes('--only')?get('--only').split(','):undefined});
  console.log(JSON.stringify({summary:report.summary,cost:report.cost},null,2));
 }
}catch(e){console.error(e.message);process.exitCode=1;}
