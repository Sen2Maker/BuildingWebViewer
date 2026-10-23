import {SelfTestRunner} from './src/self-test-runner.mjs';
import {mountSelfTestPanel} from './src/self-test-panel.mjs';
import {createAndroidAdapters} from './android-adapter-core.mjs';
const plugin=globalThis.Capacitor?.registerPlugin?.('BWVSelfTest');
if(!plugin)throw new Error('NATIVE_DIAGNOSTIC_BRIDGE_UNAVAILABLE');
const {native,readAsset,exportReport}=createAndroidAdapters(plugin);
const runner=new SelfTestRunner({native,readAsset});
mountSelfTestPanel({root:document.getElementById('self-test'),runner,exportReport});
