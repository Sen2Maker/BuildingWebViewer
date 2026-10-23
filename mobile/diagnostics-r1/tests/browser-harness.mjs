import {SelfTestRunner} from '../src/self-test-runner.mjs';
import {mountSelfTestPanel} from '../src/self-test-panel.mjs';
const runner=new SelfTestRunner();
const mounted=mountSelfTestPanel({root:document.getElementById('root'),runner});
globalThis.selfTestHarness={runner,mounted,report:null};
runner.subscribe(({type,report})=>{if(type==='finished')globalThis.selfTestHarness.report=report;});
// Exercise the actual button path, including immediate duplicate click protection.
mounted.element.querySelector('button').click();mounted.element.querySelector('button').click();
