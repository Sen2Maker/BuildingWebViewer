import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))), evidence=join(root,'evidence');
const profile=await mkdtemp(join(evidence,'browser-profile-'));let browser,ws,server;let log='';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try {
  server=createServer(async(req,res)=>{
    try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);const path=resolve(root,pathname.slice(1));
      if(!path.startsWith(root+'/src/')&&!path.startsWith(root+'/tests/browser-harness.')){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type',extname(path)==='.css'?'text/css':extname(path)==='.html'?'text/html':'text/javascript');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'");
      res.end(await readFile(path));
    }catch{res.writeHead(404);res.end();}
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  browser=spawn('/usr/bin/chromium',['--headless','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--metrics-recording-only','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',b=>{log+=b.toString();});
  let debugPort;
  for(let i=0;i<100;i++){try{debugPort=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{}if(browser.exitCode!==null)throw new Error('CHROMIUM_EXITED');await wait(50);}
  if(!debugPort)throw new Error('CHROMIUM_START_TIMEOUT');
  const targets=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let id=0;const pending=new Map();ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const waiter=pending.get(message.id);pending.delete(message.id);message.error?waiter?.reject(message.error):waiter?.resolve(message.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});ws.send(JSON.stringify({id:request,method,params}));});
  await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Page.navigate',{url:`http://127.0.0.1:${port}/tests/browser-harness.html`});
  const value=await call('Runtime.evaluate',{expression:"new Promise((resolve,reject)=>{let n=0;const id=setInterval(()=>{const report=globalThis.selfTestHarness?.report;if(report){clearInterval(id);resolve(report);}else if(++n>150){clearInterval(id);reject(new Error('BROWSER_TEST_TIMEOUT'));}},100);})",awaitPromise:true,returnByValue:true});
  if(value.exceptionDetails)throw new Error('BROWSER_TEST_FAILED');const report=value.result.value;
  assert.equal(report.environment.platform,'browser');assert.equal(report.execution,'WEB_OR_HOST_ONLY');
  assert.equal(report.cases.find(x=>x.id==='web.workerWasm').status,'PASS');assert.equal(report.cases.find(x=>x.id==='fixture.crypto').status,'PASS');assert.equal(report.summary.automaticOutcome,'INCOMPLETE');assert.equal(report.summary.manualAcceptance,'NOT_ASSESSED');
  const layout=await call('Runtime.evaluate',{expression:"({viewport:innerWidth,scroll:document.documentElement.scrollWidth,rows:document.querySelectorAll('.bwv-selftest li').length,startDisabled:document.querySelector('.bwv-selftest > button').disabled,saveDisabled:[...document.querySelectorAll('.bwv-selftest button')].find(b=>b.textContent==='保存本地报告').disabled})",returnByValue:true});
  assert.equal(layout.result.value.rows,11);assert.ok(layout.result.value.scroll<=layout.result.value.viewport);assert.equal(layout.result.value.startDisabled,false);assert.equal(layout.result.value.saveDisabled,true);
  const metrics=await call('Page.getLayoutMetrics');const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:Math.ceil(metrics.cssContentSize.height),scale:1}});
  await writeFile(join(evidence,'browser-mobile-layout.png'),Buffer.from(screenshot.data,'base64'));await writeFile(join(evidence,'example-browser-report.json'),JSON.stringify(report,null,2)+'\n');
  const output={engine:'Installed desktop Chromium, 390px emulation, not Android',automatedResult:report.summary,layout:layout.result.value,assertions:10};await writeFile(join(evidence,'browser-tests.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
} finally {
  ws?.close();if(browser&&browser.exitCode===null){browser.kill('SIGTERM');await new Promise(r=>{browser.once('exit',r);setTimeout(r,3000).unref();});}
  if(server)await new Promise(r=>server.close(r));await writeFile(join(evidence,'browser-launch.log'),log);await rm(profile,{recursive:true,force:true});
}
