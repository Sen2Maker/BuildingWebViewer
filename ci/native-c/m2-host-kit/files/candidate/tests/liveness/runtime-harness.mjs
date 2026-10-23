import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {JSDOM} from '../../project/mobile/node_modules/jsdom/lib/api.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const native=fs.readFileSync(process.env.BWV_TEST_NATIVE||root+'/project/mobile/native-patches/runtime/native-bridge.js','utf8'),core=fs.readFileSync(process.env.BWV_TEST_CORE||root+'/project/mobile/native-patches/runtime/capacitor.js','utf8'),shell=fs.readFileSync(root+'/project/src/mobile/app-shell.js','utf8');
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function setup(){
 const d=new JSDOM('<html><head></head><body><button id="mutate">save</button></body></html>',{url:'https://localhost/assets/mobile/index.html',runScripts:'outside-only'}),w=d.window,posted=[],logs=[],maps=[],timers=new Map();let count=0;
 w.Map=class extends w.Map{constructor(...args){super(...args);maps.push(this);}};w.console.error=x=>logs.push(String(x));w.setTimeout=(fn,ms)=>{timers.set(++count,{fn,ms});return count;};w.clearTimeout=id=>timers.delete(id);w.androidBridge={postMessage:s=>posted.push(JSON.parse(s))};w.Capacitor={DEBUG:false,isLoggingEnabled:false,Plugins:{}};w.WEBVIEW_SERVER_URL='https://localhost';w.eval(native);assert.equal(maps.length,1,'Only actual runtime private callback Map is selected');const callbacks=maps[0];
 w.Capacitor.PluginHeaders=[{name:'BWVProjects',methods:[{name:'listProjects',rtype:'promise'},{name:'createProject',rtype:'promise'},{name:'addListener'},{name:'removeListener'}]}];w.eval(core);w.eval(shell);w.bwvAuthorizeDocument('a'.repeat(64));
 const api=w.Capacitor.registerPlugin('BWVProjects');
 return {d,w,posted,logs,callbacks,timers,api,close:()=>d.window.close(),reply(call,value={ok:true},save=false){w.androidBridge.onmessage({data:JSON.stringify({callbackId:call.callbackId,pluginId:call.pluginId,methodName:call.methodName,success:true,save,data:value})});}};
}
const unknown=e=>e.outcomeUnknown===true&&e.delivery==='unknown'&&e.code==='NATIVE_TRANSPORT_FAILED';const notSent=e=>e.outcomeUnknown===false&&e.delivery==='notSent';

export {setup,tick,unknown,notSent};
