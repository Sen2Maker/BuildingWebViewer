# Narrow adapter boundary for reviewed Android integration

## Ownership and allowed dependencies

This standalone stage owns only its own files. Future integration belongs to the Android owner after review. No source here imports B1 or calls its mutation APIs. The only existing callable used by the host harness is the unchanged `bwv.update.probe.FilesystemCapabilityProbe.run(Path)`, owned in checkpoint C's probe directory.

Do not pass a production updater, ProjectStore, Context, health token, activation API, network client, broad BWVProjects plugin, or real user project identifier into the runner. The installed diagnostic build should bind a dedicated bridge and only trusted bundled diagnostic resources. Production should omit the test button, fixtures and signing policy unless explicitly approved for that product build.

## JavaScript-facing Environment

The runner accepts `{native, readAsset, workerProbe, crypto, hostKind}`. In Android, `hostKind` is omitted. `workerProbe` is omitted so the real WebView Worker implementation is selected. The crypto override is test scaffolding only; production diagnostic code uses real WebCrypto. The core's AbortSignal objects stay inside the JS adapter; do NOT serialize them into Capacitor PluginCall data.

Every callback receives `{runId, signal, limits, deadlineInMs}`. JS-to-native wrappers map abort to a dedicated cancellation request and bounded native executor work. Native code validates the run ID against its own active session and rejects stale handles. A native app-wide lease is mandatory across pages, Activity recreation and duplicate bridges. Cancellation may stop work cooperatively but must not kill the process or activate a real updater.

`native.openRun(ctx) -> opaqueHandle`

- Allocate a fresh app-private test namespace under a dedicated self-test cache parent, never under a user-project or active/update-root directory. The native side chooses the root; JS never supplies a filesystem path.
- Assert the canonical root is inside that namespace and is not a symlink, with no-follow/exclusive creation as supported. Hold its lease until all operations and cleanup finish.
- Create both isolated files and cache directories. Fixture ContextWrapper must override getFilesDir, getCacheDir and getApplicationContext so none can escape to production. Assert resolved store/import/export paths under the scratch root before the first write. Do not instantiate production-bound ProjectStore first and overwrite its fields afterward.
- Enforce a 4 MiB total scratch budget, bounded file counts, fixed tiny fixtures, streaming read limits, deadlines and cancellation checks. If initialization fails before returning a handle, clean its allocation before rejecting. Do not claim success after partial initialization.

`native.runtimeSnapshot({handle,...ctx}) -> {environment,runtime}`

- `environment`: platform=`android`; apkPackage, apkVersion, apkVersionCode from actual PackageManager; androidRelease/androidApi from actual Build.VERSION; webviewPackage/webviewVersion from the actually selected WebView provider when available; nativeApi and active code contentId from the pinned runtime session.
- apkBuildSha256 is optional: a verified installed-artifact SHA-256, otherwise null. Do not copy a proposed version or desired build into an observed field. Missing WebView evidence is null, not an invented provider/version. Report fixtureOnly from the actual diagnostic BuildConfig when available; a compile-only synthetic bundle is not production acceptance.
- `runtime`: sessionId, contentId, nativeApi, webRootIdentity, shaderRootIdentity. Identities must be stable SHA-256 code-root identities or exactly the current C bundled-root identity `asset:public`, never absolute paths or user content hashes. Both C bundled readers currently use `asset:public`; the contentId independently pins the actual verified inventory. sessionId is compared in memory and excluded from reports.
- This is read-only. It must not mark an update healthy, mutate current-root state or force session re-selection.

`native.roundTrip({handle,runId,challenge,...ctx}) -> {runId,challenge,runtime}`

Echo the actual challenge through the real native bridge and take a new read-only snapshot. The runner checks the challenge, immutable run ID and full snapshot equality. Do not return a precalculated “bridge passed” boolean.

`native.probeFilesystem({handle,...ctx}) -> provider evidence`

Call the real filesystem capability probe on the self-test scratch root on a dedicated native worker. Return its providerClass, directoryStreamClass, secureTraversal, unixLinkCount, fileNoFollow, directoryNoFollow, exclusiveCreation, atomicRename and directoryForce observations. False capabilities become UNSUPPORTED; exceptions become FAIL without copying raw exception messages. A host-JVM result must never be relabeled as Android. This must not toggle external-update availability or production configuration.

`native.probeScratchStore({handle,...ctx}) -> fixture observations`

Run the actual package-private ProjectStore/ArchiveImporter code against only the isolated ContextWrapper and fixed synthetic files. Required checks: scratchRootChecked, contextFilesIsolated, contextCacheIsolated, applicationContextIsolated, created, reopened, stateRoundtrip, backupRestored, cleanupVerified. Emit booleans only after the actual operations and assertions. Ensure archive fixture expansion remains within quota. Do not read/list/hash actual user projects “to prove untouched”; isolation should be proved by construction and test instrumentation. The adapter is absent in this deliverable, so its case is UNSUPPORTED, not a mocked pass.

`readAsset({handle,kind,maxBytes,...ctx}) -> {rootIdentity,bytes:Uint8Array}`

The only accepted kinds are web-canary and shader-canary. Map them to fixed packaged fixture filenames, using the immutable active web/shader roots from the runtime session. Stream no more than maxBytes before bridge serialization; reject oversized input before allocation. Root identities and exact bytes must match. Do not accept URLs, arbitrary filesystem paths or network fetch fallbacks.

`native.closeRun({handle,...ctx}) -> {removed:boolean}`

Close streams, release worker handles, and remove only that run's own scratch tree without following links. Run after outstanding operations really settle, including late openRun completion. Removed=true requires an actual empty/absent scratch check. Do not delete a broad cache parent. Retain/quarantine an unresolved run rather than starting overlapping work. Report cleanup errors without raw paths.

`exportReport({runId,fileName,mimeType,text})`

Provided separately to the UI, not called by the runner. A trusted explicit click invokes it. Native side should validate the bounded report schema/active report provenance and launch a local ACTION_CREATE_DOCUMENT-style save flow; do not automatically invoke a third-party upload/share destination. Resolve only a truthful flow outcome; returning `{cancelled:true}` indicates user cancellation and must not be described as a saved file. The panel blocks new runs while this promise is pending and binds its completion to the originating report. No local save is wired up here.

## Native-only RecoveryActivity requirement, still pending

WebView failure cannot be a prerequisite for native self-diagnostics. A native recovery button must run the same native metadata/provider/scratch cases on a native executor, with the same app-wide lease, progress/cancel controls, budgets and report vocabulary. Missing WebView/Worker cases are NOT_RUN or UNSUPPORTED; never synthesize PASS. This pure-JS UI is NOT a native recovery implementation. The Android owner must implement, compile and test that entry point.

## Test trust and destructive gates

Ephemeral WebCrypto keys in the JS fixture never leave memory and never enter a production verifier registry. These checks are explicitly not SignedManifest/updater policy acceptance tests. Any later synthetic signed-package/fault fixture must live under an isolated test policy and namespace, with no real activation, install, reboot, process kill or production trust expansion. APK installation prompts, visual/touch confirmation and physical power-loss/system-kill behavior remain explicit manual gates.
