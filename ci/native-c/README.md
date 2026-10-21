# M1.1 exact main-payload native compile checkpoint

This checkpoint compiles the reviewed CAD-free main Android source with its **real, complete offline web payload**, not a synthetic compile fixture. It is still **not an APK, release or runtime/device acceptance**. Root repository application files, main, tags and releases remain untouched.

## Third-party preferred source

Read [SOURCE_DELIVERY.md](SOURCE_DELIVERY.md) alongside the compiled browser assets. It provides the full immutable Mediabunny 1.61.4 preferred-source archive, verification hashes and existing project bundling materials while retaining MPL-2.0. For this public CI delivery it supersedes the frozen authored notes that mention only an incomplete npm source tarball or a pending source URL; it does not claim final APK dependency/license acceptance.

## Exact scope

`project/` contains exactly 390 M1.1 files, 4,603,295 bytes. `native-files.json` binds every path/size/SHA256. The final Android public tree has 109 files and 1,764,820 bytes, including the real project home, five 3D/point-cloud/Gaussian tools, real paired shaders, local diagnostics and reviewed notices. No CAD engine, editor, parser, CAD vendor payload, font or real user project is included. Reviewed non-CAD video-export code and additive upstream notices retain their terms; this checkpoint does not adopt a new application license or complete outstanding source-offer review.

- Native manifest SHA256: `889b605fed7ec4e0b928fcd2fd79bf095092249f82324d28792a881ebde5f81c`
- Separate 806-file project source manifest: `d6cd66a6bc6c6e49ea17ec49e5d1b67c394439e0cf712c11e3419a0bd877b4fe`
- Full 850-entry checkpoint manifest: `9a88d0bb10ad9672cc00ff4040c272d239b28fade20b6f42bcb1c3d03d9a6f3d`
- Real main build: `main-app-61a42ee64d2a6f14f3f90bde`
- Final inventory: 14,681 bytes, SHA256 `44820be905063d7c279c3933f45e22e6e6d7df744d9ec1480c6454d69379e3de`

This snapshot is the exact native compile subset, not the separate full Vite source tree. Its web assets have already been assembled, synchronized and finalized from the reviewed source. CI deliberately does **not** run an incomplete Vite rebuild, `cap sync`, the old fixture generators, or either assembly/finalization command. It verifies the reviewed final bytes, installs integrity-locked public mobile dependencies with lifecycle scripts disabled, and applies only the exact hash-gated M1.1 Capacitor overlay.

The real-payload verifier rejects fixture/pre-sync flags, stale fixture owners, missing/unlisted/rehashed asset changes, fake shaders, wrong native identity, invalid offline HTML/core/shell links and CAD modules. It independently checks the packaged 109-file inventory against the frozen source manifest and the 107-file pre-sync web tree. After patching, it verifies the installed overlay/helpers/core and absence of legacy JavascriptInterface registration. Historical C2 synthetic-helper tests are retained as isolated regression cases only; the M1 workflow's payload acceptance path is `verify-main-payload.py`.

## Native transport and safeguards

M1.1 corrects native UI-thread replies and listener publication/retirement while preserving nonce, main-frame, exact-origin, document and per-call ownership. External updates remain disabled. Native recovery/export remains available without web startup. Destructive cleanup/empty-trash is disabled pending a separate backup-only-project storage review. Existing storage/import/render algorithms and C2 update/diagnostic state machines are retained.

The build uses preinstalled full Java 21, Android API 36 and build-tools 36.0.0. Missing tools stop rather than install SDK/JDK packages or accept licenses. The checksum-pinned Gradle distribution and lockfile-pinned public dependencies may be downloaded. `contents: read`, pinned checkout with credentials disabled and the unchanged 121-task guard remain. Only Java compile, Android lint and local JVM tests run. No APK/AAB, signing, install, emulator, upload, release or deploy is permitted.

## Evidence and result contract

The source gate prints thirty named, actual source indicators, explicitly **not** runtime startup, document-epoch simulation or proof of security. Build-stage forensics independently report fixed step outcomes without reading user data or including environment secrets. The result gate prints up to 200 bounded lint issues, blockers first, with explicit omitted counters, and all 32 expected JUnit testcase identities/statuses across 9 suites. Missing/duplicate/substituted test records, summary-only XML, errors, failures or **any skipped test** fail. Test source hashes are bound to `expected-junit.json`. The Gradle step remains independently authoritative; `--continue` does not suppress failure.

The parent C2.2 commit `a3b718d609da18751187030246a92098b502454e` passed actual compile, lint 0 errors/61 warnings and 28 JUnit tests. **That evidence does not cover M1.1.** This checkpoint requires a fresh actual Android run and warning review. Four new portable authority tests bring the expected total to 32; their presence is not an execution result.

Android WebMessage callbacks, startup/recovery, navigation/reload/listeners, iframe/data-route isolation, SAF/provider cancellation and process death, offline import/view/export, renderer/touch/performance and OEM transfer remain device gates. Instrumentation sources are retained but not compiled or run here. Old App/data must be preserved and export/re-import verified before migration acceptance. No signing, package, install, deployment or production-update authority is implied.
