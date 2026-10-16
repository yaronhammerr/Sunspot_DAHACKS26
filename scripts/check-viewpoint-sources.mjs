/** Refresh page availability/content hashes without pretending facts were re-reviewed.
 * Reports go to ignored work/, never overwrite manual facts or their checkedAt dates.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const run=promisify(execFile),root=new URL('../',import.meta.url);
const sources=JSON.parse(await readFile(new URL('data/research/sources.json',root),'utf8'));
const queue=[...new Map(Object.values(sources).map(s=>[s.url,s])).values()],report=[];
await mkdir(new URL('work/viewpoint-research/',root),{recursive:true});
async function worker(){while(queue.length){const source=queue.shift();try{const {stdout}=await run('curl',['--fail','--location','--silent','--show-error','--max-time','40',source.url],{encoding:'buffer',maxBuffer:8*1024*1024});const sha256=createHash('sha256').update(stdout).digest('hex');report.push({id:source.id,url:source.url,checkedAt:new Date().toISOString(),status:sha256===source.sha256?'unchanged-content':'review-required',sha256});}catch(error){report.push({id:source.id,url:source.url,checkedAt:new Date().toISOString(),status:'fetch-failed',error:String(error.message).slice(0,300)});}}}
await Promise.all([worker(),worker(),worker()]);
await writeFile(new URL('work/viewpoint-research/source-health.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checked:report.length,reviewRequired:report.filter(r=>r.status==='review-required').length,failed:report.filter(r=>r.status==='fetch-failed').length,report:'work/viewpoint-research/source-health.json',note:'No visitor facts or evidence dates changed. Read and reconcile changed sources before updating the curated file.'},null,2));
