import {readFile} from 'node:fs/promises';
import {nextSpoolRequest,recordSpoolExecution,completeSpoolRequest} from './spool.mjs';
const [command,directory,id,executionId]=process.argv.slice(2);
try{
 if(command==='next')process.stdout.write(JSON.stringify(await nextSpoolRequest(directory))+'\n');
 else if(command==='started'){await recordSpoolExecution(directory,id,executionId);process.stdout.write('{"recorded":true}\n');}
 else if(command==='complete'){const response=JSON.parse(await readFile(id,'utf8'));await completeSpoolRequest(directory,response);process.stdout.write('{"completed":true}\n');}
 else throw Error('Usage: bridge.mjs next DIR | started DIR UUID EXECUTION_ID | complete DIR RESPONSE_FILE');
}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
