# Native C1.2 compile checkpoint

This isolated snapshot is **not a release or a full App**. Its synthetic package identity is 1.0.0/versionCode 1, but it is not an installable v1.0.0 build. The existing repository application is unchanged by this checkpoint.

The workflow only compiles native Java, runs Android lint, and runs local JVM unit tests. It requires already-installed Java 21, Android platform 36 and build-tools 36.0.0; missing tools stop rather than install an SDK or accept licenses. Public build dependencies and checksum-pinned Gradle may be downloaded. The hosted image is rolling and its actual tool versions are logged.

There are no signing credentials, deployment, release publication, APK/AAB tasks or artifact uploads. New transferred files contain no CAD engine WASM, CAD import wrappers, fonts or real user projects. The tiny web fixture and its shader stubs are deliberately not functional rendering tests. The core Capacitor bridge and pinned source patch retain their upstream MIT notice. Existing rights and licenses are not changed.

`project/` is the exact frozen 140-file C1.2 snapshot. `native-files.json` binds every path, size and SHA256. Sources and generated synthetic assets are included together. Preparation reapplies the hash-gated Capacitor patch, generates the fixture, runs Capacitor sync and finalizes the exact post-sync asset inventory. It must reproduce the frozen source tree and the final inventory digest:

`6a3ec8f52aec3ffe007a5d2308788fce9899b4ba01dadb4f5ab809972ff3ae38`

The native fixture has external updates disabled and a compile-fixture build flag. No legacy trust is imported and no runtime signature policy is weakened. C1's new Android integration still requires independent source review, actual hosted compiler/lint results, lifecycle/provider tests, full licensed web assembly, one-tap self-test integration and real-device acceptance. Host tests or syntax checks do not establish Android API compatibility.

The first resolved Gradle graph must pass an explicit task allowlist before task actions. Unknown tasks stop for review. Resource/class-library intermediates are distinct from forbidden installable packages. The final result gate requires actual JUnit/lint XML and refuses installable outputs. No-source or all-skipped test results do not count as success.

The single provider instrumentation source is retained for future review but is **not compiled or run by this workflow**. No emulator or physical device is involved.

C1.2 corrects a ProcessRuntime local-variable shadowing error found by the actual Android compiler and passes the already validated runtime snapshot to the renderer. Hosted compilation must be rerun; this correction is not an APK or device acceptance claim.

C1.2 also replaces a newer absolute ByteBuffer bulk-read API with an API-30-compatible duplicate-buffer read. The guard and minimum SDK are unchanged; --continue permits independent unit tasks after lint failures, never a green result for a failed task.
