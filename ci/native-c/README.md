# M1.2 + Recovery R1 integrated native compile checkpoint

This checkpoint compiles the reviewed CAD-free main Android source with its **real, complete offline web payload**, not a synthetic compile fixture. It is still **not an APK, release or runtime/device acceptance**. Root repository application files, main, tags and releases remain untouched.

## Third-party preferred source

Read [SOURCE_DELIVERY.md](SOURCE_DELIVERY.md) alongside the compiled browser assets. It provides the full immutable Mediabunny 1.61.4 preferred-source archive, verification hashes and existing project bundling materials while retaining MPL-2.0. For this public CI delivery it supersedes the frozen authored notes that mention only an incomplete npm source tarball or a pending source URL; it does not claim final APK dependency/license acceptance.

## Exact scope

`project/` contains exactly 391 integrated files, 4,619,240 bytes. `native-files.json` binds every path/size/SHA256. The final Android public tree has 109 files and 1,764,820 bytes, including the real project home, five 3D/point-cloud/Gaussian tools, real paired shaders, local diagnostics and reviewed notices. No CAD engine, editor, parser, CAD vendor payload, font or real user project is included. Reviewed non-CAD video-export code and additive upstream notices retain their terms; this checkpoint does not adopt a new application license or complete outstanding source-offer review.

- Native manifest SHA256: `97ac83d18dceeeffbd805dc9457827fe53474a82a8a226d281fbccea8b2691ce`
- Separate 807-file project source manifest: `410c5e11d65c823adb5fc26a113ff71a91a912c1d351b68fbeeaa572dbffff65`
- New 828-entry integration snapshot manifest: `f2dec7ea62d187f83bf9d719cb6470e521e4c6d60216e78c97878af044a372ba`
- Real main build: `main-app-61a42ee64d2a6f14f3f90bde`
- Final inventory: 14,681 bytes, SHA256 `44820be905063d7c279c3933f45e22e6e6d7df744d9ec1480c6454d69379e3de`

This is a new integration, not byte-equivalent to frozen M1.2: only RecoveryActivity is overlaid with reviewed SHA256 `133eb4ee37d883ae35839eafa202c09b64797c6c7a9482cab0562e7961a3ba21`. The original M1.2 and Recovery R1 inputs remain frozen and unmodified. The 828-entry local integration inventory comprises the full 807-file project plus 21 reviewed host-test files; it is not the original 952-entry M1.2 checkpoint.

This snapshot is the exact native compile subset, not the separate full Vite source tree. Its web assets have already been assembled, synchronized and finalized from the reviewed source. CI deliberately does **not** run an incomplete Vite rebuild, `cap sync`, the old fixture generators, or either assembly/finalization command. It verifies the reviewed final bytes, installs integrity-locked public mobile dependencies with lifecycle scripts disabled, and applies only the exact hash-gated M1.1 Capacitor overlay.

The real-payload verifier rejects fixture/pre-sync flags, stale fixture owners, missing/unlisted/rehashed asset changes, fake shaders, wrong native identity, invalid offline HTML/core/shell links and CAD modules. It independently checks the packaged 109-file inventory against the frozen source manifest and the 107-file pre-sync web tree. After patching, it verifies the installed overlay/helpers/core and absence of legacy JavascriptInterface registration. Historical C2 synthetic-helper tests are retained as isolated regression cases only; the M1 workflow's payload acceptance path is `verify-main-payload.py`.

## M1.2 activity-result ownership

Exactly five production paths change from the M1.1 parent, including the new `MainActivityOperations.java` coordinator. One UI-owned slot captures its original caller before registry registration and remains reserved across navigation or uncertain launch. Definitive result/cancellation settles only that attempt; duplicates and replacement callers cannot adopt it. Restored attempts are ownerless, discard-only and limited to 16 registrations per saved-state lineage, with malformed counters rejected. Immediate/deferred retirement plus save-time flushing reclaim normal completed registry mappings. The bounded stored-pending orphan mapping residue remains documented, not claimed eliminated.

The 109 packaged public assets and all 32 existing JUnit sources/contracts are byte-identical to M1.1. The existing M1.1 Capacitor overlay and source-delivery notice are preserved verbatim. No new JavaScript or dependency is introduced.

The additional [host ownership kit](tests/README.md) is 18 exact files from the reviewed checkpoint, separately hash-gated by `activity-tests.json`. With the preinstalled full JDK it compiles the real coordinator/guard/lease and unchanged method slices against explicit Android/AndroidX doubles. It runs 44 scenarios / 872 assertions and 13 compile-valid mutation controls, each required to fail at its intended runtime assertion. These are host regressions, not additional Android JUnit methods and not provider, OS restoration or device execution. The Gradle allowlist and its three requested targets are unchanged.

## Reviewed Recovery R1 overlay

The one-file RecoveryActivity overlay binds each backup to an immutable request/file and captures a destination only after a matching one-shot result. Routes are never recycled within the saved Activity lineage: 4101 through 65535 allows 61,435 attempts, with cancellation/preparation failure consuming a route. Saved state retains canonical counters and routing only, never project/file/URI authority. Restored routes are ownerless discard-only orphans; invalid state remains closed. Old preparation completion cannot launch from a retired Activity. Accepted writes may finish against their originally captured source/destination and are not claimed canceled or rolled back.

The exact three-file Recovery host test kit runs only from a disposable copy, never its reviewed source root. It checks 21 scenarios / 59 assertions plus four compile-valid mutations that must fail at intended runtime assertions. Its controlled provider doubles and synthetic temporary files are not real DocumentsUI or provider behavior. The prior stale-result scenario is a host-injected scheduling demonstration, not a proven Android exploit or arbitrary existing-document overwrite.

A restoration during preparation or uncertain launch can retain an orphan without a picker able to return. Recovery remains deliberately fail-closed: close pickers and the current task, then reopen from the icon; do not clear storage or uninstall. Durable process-death continuation and accepted-copy cancellation are not promised.

## Native transport and safeguards

M1.1 corrects native UI-thread replies and listener publication/retirement while preserving nonce, main-frame, exact-origin, document and per-call ownership. External updates remain disabled. Native recovery/export remains available without web startup. Destructive cleanup/empty-trash is disabled pending a separate backup-only-project storage review. Existing storage/import/render algorithms and C2 update/diagnostic state machines are retained.

The build uses preinstalled full Java 21, Android API 36 and build-tools 36.0.0. Missing tools stop rather than install SDK/JDK packages or accept licenses. The checksum-pinned Gradle distribution and lockfile-pinned public dependencies may be downloaded. `contents: read`, pinned checkout with credentials disabled and the unchanged 121-task guard remain. Only Java compile, Android lint, exact local JUnit tests and the bounded activity/Recovery host ownership regressions run. No APK/AAB, signing, install, emulator, upload, release or deploy is permitted.

## Evidence and result contract

The source gate prints thirty named, actual source indicators, explicitly **not** runtime startup, document-epoch simulation or proof of security. Build-stage forensics independently report fixed step outcomes without reading user data or including environment secrets. The result gate prints up to 200 bounded lint issues, blockers first, with explicit omitted counters, and all 32 expected JUnit testcase identities/statuses across 9 suites. Missing/duplicate/substituted test records, summary-only XML, errors, failures or **any skipped test** fail. Test source hashes are bound to `expected-junit.json`. The Gradle step remains independently authoritative; `--continue` does not suppress failure.

The exact parent is M1.1 commit `1c925b40d71fcccb166c1bc82b0ad52371381ed8`, tree `df05d210c1ab68e3953b9398c06dc3c5b16be9de`. Its successful workflow does **not** cover this integrated five-path production delta. Fresh actual M1.2 Android compile, lint and all 32 JUnit records remain required. Local host results are not a substitute for that run.

Recovery backup ownership has source-review and host-regression clearance in this integration only, not Android/provider/device acceptance. Post-readiness provider-liveness/transport retention remains separate and is not changed or cleared here.

Android WebMessage callbacks, startup/recovery, navigation/reload/listeners, iframe/data-route isolation, SAF/provider cancellation and process death, offline import/view/export, renderer/touch/performance and OEM transfer remain device gates. Instrumentation sources are retained but not compiled or run here. Old App/data must be preserved and export/re-import verified before migration acceptance. No signing, package, install, deployment or production-update authority is implied.
