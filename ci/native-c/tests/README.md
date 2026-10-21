# M1.2 host activity-result ownership regression kit

`activity-results/` contains the reviewed 18-file M1.2 kit with only run_regression.py adapted to expect the corrected public save-state signature; all harness/scenario/double bytes remain unchanged. `../activity-tests.json` pins all paths, sizes and SHA256 values. It contains only test code/templates and controlled Android/AndroidX doubles. No real user project, provider content, device trace, compiled artifact, reviewer notes or source archive is included.

The suite compiles the complete production coordinator, authority guard and export lease plus unchanged extracted MainActivity/plugin/service/report-save methods. Lifecycle wiring checks are source checks only. The model registry exercises raw callback ordering and controlled stored-pending delivery; it is not the Android framework. Source fragment hashes and compile/test evidence are written only to the runner temporary directory.

Run with the preinstalled full Java 21, from the repository root:

```sh
python3 -B ci/native-c/verify-native-allowlist.py ci/native-c/tests/activity-results ci/native-c/activity-tests.json
python3 -B ci/native-c/tests/activity-results/run_regression.py --candidate ci/native-c --output "$RUNNER_TEMP/bwv-m12-activity-regression"
python3 -B ci/native-c/tests/activity-results/run_mutations.py --candidate ci/native-c --output "$RUNNER_TEMP/bwv-m12-activity-mutations"
```

Expected: 44 scenarios / 872 assertions pass, then all 13 compile-valid mutations are killed by their designated runtime assertions. Mutation work copies only eight required production sources to a temporary directory and never modifies the frozen candidate. Fixed scenario names and synthetic values may appear in stdout; no user data is opened. A compiler failure is not accepted as a killed mutation.

The existing 32-method / 9-suite Android JUnit contract is separate and remains byte-identical to M1.1. Passing this host model is not Android compilation, runtime startup, actual ActivityResultRegistry behavior, SAF/provider liveness, OS process recreation, APK generation or device acceptance. Recovery SAF backup ownership has a separately reviewed source correction and controlled host suite in this integration, but real Android/provider/device acceptance remains open.

## Recovery R1 host kit

`recovery-ownership/` contains exactly three reviewed files, bound by `../recovery-tests.json`. The source overlay is pinned separately to SHA256 `133eb4ee37d883ae35839eafa202c09b64797c6c7a9482cab0562e7961a3ba21`. Its original runners write into their own root, so `../run-recovery-ownership.py` checks the source/kit pins and makes a disposable copy before execution. Only the reviewed RecoveryActivity and three test files are copied. It expects 21 scenarios / 59 assertions and all four compile-valid mutation controls. Source files remain unchanged; no user data, SDK or actual provider is used.

```sh
python3 -B ci/native-c/run-recovery-ownership.py ci/native-c "$RUNNER_TEMP/bwv-m12-recovery-r1"
```

The new integration keeps the M1.2 activity suite and the original exact 32-test Android JUnit contract separate. The additional Recovery host tests do not increase that JUnit count or claim full Activity/onCreate/Android API linkage, process-death continuation, real provider overwrite behavior or device acceptance.
