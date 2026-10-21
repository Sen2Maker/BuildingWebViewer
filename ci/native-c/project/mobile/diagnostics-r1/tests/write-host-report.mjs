import {writeFile} from 'node:fs/promises';
import {SelfTestRunner,serializeReport} from '../src/self-test-runner.mjs';
import {realHostWorkerProbe} from './helpers.mjs';
const report=await new SelfTestRunner({hostKind:'node',workerProbe:realHostWorkerProbe}).run();
await writeFile(new URL('../evidence/example-host-report.json',import.meta.url),serializeReport(report)+'\n');
console.log(`Actual host report: ${report.summary.counts.PASS} PASS; ${report.summary.counts.UNSUPPORTED} UNSUPPORTED; ${report.summary.counts.NOT_RUN} NOT_RUN. Android absent, acceptance not assessed.`);
