# Main M2 exact native compile checkpoint

This snapshot uses independently reviewed **M2 liveness + recovery integration**, with real CAD-free offline assets. It is **not an APK, release, Android runtime startup or device acceptance**. Only the dedicated CI namespace/workflow and additive changelog change. Root application files, main, tags and releases are not updated.

## Exact source and asset identity

`project/` contains exactly **394 native-build input files, 4,691,904 bytes**. `native-files.json` binds every path, size and SHA256 to frozen M2:

- Native394 manifest: `a798f0a630d7b612eb508c746c88ec880c1fd9e3d7b4cc75aa652c242f60422e`.
- Separate project810 manifest: `aebe7880a4a101885e96e4f69214596431db62de699ba2d44be37fbc49e8822c`.
- Full checkpoint1117 manifest: `536d7cae87912a87d722ad51003c8954769ff8866f78269cb64a8885aa55d559`.
- Real public payload: **109 files, 1,766,371 bytes**; build `main-app-b2f12efb65bec0cea4452d26`.
- Final inventory: **14,681 bytes**, SHA256 `7bf30b9f9bf05b61140162562c32db9b0f5293b7459f2b2b4defd9e2d2edb802`.

All109 public files are byte-identical to reviewed L1.R1. Relative to actual R2 CI, exactly four public files intentionally change: `assets/js/capacitor.js`, `assets/mobile/app-shell.js`, `native-web.json`, and `asset-inventory.json`; other105 are unchanged. The complete native parent delta is3 additions and16 modifications, no removals. Do not substitute the earlier R2 inventory or claim old-byte equivalence.

The real home, offline viewers, Gaussian shaders, diagnostics and notices remain, with no CAD engine/editor/parser/vendor/font or real user project. This is the native subset, **not** the full810-file Vite source. CI never rebuilds/synthesizes assets, runs cap sync, or runs assembly/finalization commands. It verifies final bytes, installs integrity-locked mobile dependencies without lifecycle scripts, and applies only exact M2 hash-gated Java/helper/runtime overlays.

## Reconciled corrections

M2 preserves reviewed activity-result and recovery backup ownership: immutable attempt/file ownership, monotonic routing, discard-only restored routes, preparation guards and one-shot accepted destinations. MainActivity's save override remains public, matching actual Capacitor8.5.3.

M2 adds reviewed L1.R1 exception handling. A thrown provider send latches failure without replaying an uncertain mutation; reentrant serialization cannot bypass that latch. Terminal callbacks retire before consumer execution; keepAlive semantics remain. Native reply failure revokes only the owned current document and routes to recovery. RecoveryActivity adds a fixed bilingual do-not-resubmit caution without new callbacks or file authority. Removing its three provenance-listed additions reproduces the reviewed ownership source.

An exception after provider entry has unknown outcome. Silent provider loss without a thrown exception remains unresolved; no general timeout or replay guarantee exists. Restored preparation/uncertain launch may conservatively block without a future result. Close pickers and the current task, then reopen; never clear storage or uninstall. An accepted write may continue at its captured destination after Activity destruction; process death may interrupt output. Source projects/local backups are not automatically deleted.

## Tests and enforced boundaries

The separately pinned host kit runs real reviewed runtime files and extracted native methods against controlled doubles, plus compile-valid negative controls. It does not inflate Android JUnit counts or claim provider/device behavior. Its wrapper verifies source/kit/dependency pins before copying to a fresh temporary root, never using frozen inputs as output directories. See the adjacent host-kit manifest/wrapper for exact records and commands.

The byte-identical16-lifecycle audit checks installed Capacitor8.5.3 BridgeActivity and **preinstalled Android36 Activity declarations**. The actual-source public save-method probe must compile; a protected-access mutation must reproduce weaker-access failure. Local API-text evidence is labelled separately, not called an installed-SDK result.

The unchanged guard permits only the approved121-task graph for three requested Gradle targets:

- `:app:compileReleaseJavaWithJavac`
- `:app:lintRelease`
- `:app:testReleaseUnitTest`

The unchanged JUnit contract requires all **32 exact testcase identities in9 suites**, bound source hashes, zero errors/failures/skips. Host regressions are separate. The result gate prints up to200 bounded lint issues with explicit truncation and all32 JUnit records; missing/duplicate/substituted records or missing reports fail. Gradle's exit status remains independently authoritative.

Thirty unchanged source-only indicators and fixed build-stage outcomes provide forensic evidence without user data or simulated document epochs/Android startup. The installed verifier checks Java/helpers and both runtime files, including native-bridge.js and public-payload core bytes.

Preinstalled full Java21, Android36 and build-tools36.0.0 are mandatory. Missing tools stop; no SDK/JDK install or license fallback. Read-only permission, pinned credentials-disabled checkout, ephemeral Gradle cache and existing dependency locks remain. No APK/AAB, signing/key generation, install, emulator, upload, release or deploy is added.

## Source delivery and acceptance status

[SOURCE_DELIVERY.md](SOURCE_DELIVERY.md) remains byte-identical. Its immutable complete Mediabunny preferred-source directions supersede old authored incomplete/pending-source notes for CI delivery, preserving MPL rights. Capacitor MIT headers/license remain; exact modified Java/runtime files are supplied in `project/mobile/native-patches/`. No new application license or final APK dependency/source-offer acceptance is claimed.

Actual parent: commit `6c851e55adc4cdea7147d48d07df909dc75d0c73`, tree `273d22fdc35e2634837b01431b5b6a50fbc5f7f9`. Its run39637982899 passed Java compile,32JUnit and lint0errors/60warnings. **That result does not certify M2.** Fresh M2 compile/lint/JUnit, actualSDK audit and hosted host regressions remain required.

Actual WebView/provider threading, DocumentsUI/recovery rotation/process loss, rendered caution, repeated export, interrupted writes, offline renderer/GPU/touch/performance and user-controlled device checks remain separate. Instrumentation sources are retained but not compiled/run here. Packaging/signing/install and production-update authority remain outside this task.
