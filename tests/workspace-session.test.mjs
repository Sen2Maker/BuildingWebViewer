import assert from 'node:assert/strict';
import {openWorkspaceSession} from '../src/shared/workspace-session.js';
const events={},status=[],writes=[];let staged=[],project={files:[],states:{}},hold=null,fail=false;
const api={getProject:async()=>project,beginExport:async()=>{staged=[];return {token:'t'};},appendExport:async({data})=>staged.push(Buffer.from(data,'base64')),cancelExport:async()=>{},saveState:async({tool,state})=>{project.states[tool]=state;writes.push(['state',state.value]);},commitSnapshot:async({tool,state})=>{const text=Buffer.concat(staged).toString();if(hold)await hold;if(fail)throw Error('disk full');const key='key-'+writes.length;project.states[tool]={...state,snapshotKey:key};project.files=[{path:'.bwv/'+tool+'.snapshot',key,size:text.length}];writes.push([text,state.value]);return {snapshotKey:key};}};
globalThis.Capacitor={isNativePlatform:()=>true,registerPlugin:()=>api};globalThis.location={href:'https://localhost/generate.html?project=p',replace(){}};
globalThis.document={documentElement:{lang:'en'},createElement:()=>({setAttribute(){}}),querySelector:q=>q==='header'?{append(){}}:null,addEventListener:(name,fn)=>events[name]=fn};globalThis.addEventListener=(name,fn)=>events[name]=fn;
let revision={},value='A',blobText='A',restored=false;
const session=await openWorkspaceSession({tool:'generate',restore:async({snapshot})=>{assert.equal(snapshot,null);restored=true;},capture:()=>{const bytes=blobText;return {revision,state:{value},blob:()=>new Blob([bytes])};},onStatus:kind=>status.push(kind)});
assert(restored);await session.flush();assert.deepEqual(writes,[['A','A']]);await session.flush();value='camera';await session.flush();assert.deepEqual(writes.at(-1),['state','camera']);
let release;hold=new Promise(r=>release=r);revision={};blobText='B';value='B';const pending=session.flush();await new Promise(r=>setTimeout(r,0));revision={};blobText='C';value='C';session.flush();release();hold=null;await pending;assert.deepEqual(writes.slice(-2),[['B','B'],['C','C']]);
revision={};blobText='D';value='D';fail=true;await assert.rejects(session.flush(),/disk full/);assert.equal(project.states.generate.value,'C');fail=false;await session.flush();assert.deepEqual(writes.at(-1),['D','D']);await session.flush();value='E';await session.flush();assert.equal(project.states.generate.value,'E');
assert(status.includes('error'));assert.equal(status.at(-1),'saved');console.log('PASS native workspace atomic snapshot adapter, coalesced edits, metadata-only saves and failure retry');

const restoredCapture=()=>({revision,state:{value},blob:()=>new Blob([blobText])});
const countBefore=writes.length;
const unchanged=await openWorkspaceSession({tool:'generate',restore:async()=>({snapshotUnchanged:true}),capture:restoredCapture,onStatus:()=>{}});await unchanged.flush();assert.equal(writes.length,countBefore);
revision={};blobText='new imported points';value='new source';
const imported=await openWorkspaceSession({tool:'generate',restore:async()=>({snapshotUnchanged:false}),capture:restoredCapture,onStatus:()=>{}});await imported.flush();assert.deepEqual(writes.at(-1),['new imported points','new source']);
console.log('PASS unchanged snapshot reuse and newly imported data snapshot commit');
