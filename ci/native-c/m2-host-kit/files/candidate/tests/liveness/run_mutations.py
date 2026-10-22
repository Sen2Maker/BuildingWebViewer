from pathlib import Path
import argparse,os,subprocess,tempfile,json
here=Path(__file__).resolve().parent;root=here.parents[1];p=argparse.ArgumentParser();p.add_argument('--output',type=Path);a=p.parse_args();out=a.output or Path(tempfile.mkdtemp(prefix='transport-liveness-mutations-'));out.mkdir(parents=True,exist_ok=True)
native=(root/'project/mobile/native-patches/runtime/native-bridge.js').read_text();core=(root/'project/mobile/native-patches/runtime/capacitor.js').read_text()
cases=[('swallow-provider','send','native','win.androidBridge.postMessage(serialized === undefined ? JSON.stringify(data) : serialized);','try { win.androidBridge.postMessage(serialized === undefined ? JSON.stringify(data) : serialized); } catch (_) {}','provider failure must reject'),('retain-callbacks','send','native','callbacks.clear(); // Retire first;','/* mutation retains callbacks */ // Retire first;','failed document must retire callback Map'),('lie-about-outcome','send','native','error.outcomeUnknown = unknown;','error.outcomeUnknown = false;','provider-entered failure is outcome unknown'),('resolve-only-add','add','core','r=new Promise((e,t)=>n.then(()=>e({remove:s}),t))','r=new Promise(e=>n.then(()=>e({remove:s})))','provider failure must reject'),('unawaited-remove','remove','core','await g({eventName:e,callbackId:s},t)','g({eventName:e,callbackId:s},t)','provider failure must reject')]
cases.extend([('omit-reentrant-latch','reentry','native','if (transportFailed) throw transportError(false);','/* mutation omits post-serialization latch */','reentrant failure must stop outer provider entry'),('omit-terminal-retirement','terminal','native','if (terminal && callbacks.get(result.callbackId) === storedCall) callbacks.delete(result.callbackId);','/* mutation leaves terminal owner retained */','terminal throwing consumer must not receive failure twice')])
results=[]
for name,mode,target,before,after,expected in cases:
 d=out/name;d.mkdir();n,c=native,core
 source=n if target=='native' else c
 assert source.count(before)==1,(name,source.count(before));source=source.replace(before,after)
 if target=='native':n=source
 else:c=source
 (d/'native-bridge.js').write_text(n);(d/'capacitor.js').write_text(c);env={**os.environ,'BWV_TEST_NATIVE':str(d/'native-bridge.js'),'BWV_TEST_CORE':str(d/'capacitor.js')}
 run=subprocess.run(['node',str(here/'mutation-probe.mjs'),mode],env=env,text=True,capture_output=True,timeout=15);(d/'result.txt').write_text(run.stdout+run.stderr)
 assert run.returncode!=0 and expected in run.stderr,(name,run.returncode,run.stderr)
 results.append({'mutation':name,'exitCode':run.returncode,'intendedAssertion':expected});print('KILLED '+name+': '+expected)
(out/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(str(len(results))+' liveness runtime mutations killed by intended assertions; no production file changed')
