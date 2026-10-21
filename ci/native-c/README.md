# Native C2.2 compile checkpoint

This isolated snapshot is **not a release or a full App**. Its synthetic package identity is 1.0.0/versionCode 1, but it is not an installable v1.0.0 build. The existing repository application is unchanged.

The workflow only compiles native Java, runs Android lint, and runs local JVM unit tests. It requires already-installed Java 21, Android platform 36 and build-tools 36.0.0; missing tools stop rather than install an SDK or accept licenses. Public lockfile-pinned build dependencies and checksum-pinned Gradle may be downloaded. The rolling hosted image and actual tool versions are logged.

There are no signing credentials, deployment, release publication, APK/AAB tasks or artifact uploads. New transferred files contain no CAD engine WASM, CAD import wrappers, fonts or real user projects. Diagnostic canaries and shader stubs are synthetic, not functional CAD/rendering acceptance. The core Capacitor bridge and pinned source overlay retain their upstream MIT notice. Existing rights and licenses are unchanged.

## Exact frozen source

`project/` contains exactly 204 C2.2 files, 1,108,956 bytes. `native-files.json` binds every path, size and SHA256 to the independently reviewed source.

- Native source manifest SHA256: `34c194c030a1c3badf101ac5d51eada40f59343969cebc4313a4691f4c649a7d`
- Full private checkpoint manifest SHA256: `b91d42b6947b06ad186b8b7c7413e493779d8a01b5b804a7aea81af20eff1912`
- Public synthetic build: `native-diagnostic-fixture-c2`
- Final 20-file public inventory: 2,505 bytes, SHA256 `ada8f8da8cfa90bac012fa4806f915ded9bdf55f461aa9d2621a16caf9349bf7`

Preparation reapplies the hash-gated Capacitor 8.5.3 overlay, generates the tiny fixture, runs Capacitor sync, and finalizes the post-sync inventory. The fixture gate compares regenerated pins against the frozen source manifest, then checks an exact path/hash bijection. Unlisted payloads and rehashed fixture drift fail closed.

The diagnostic fixture keeps external updates disabled. C2.2 adds fixed diagnostic admission reasons, per-Activity attempt/run identity, immutable report export tickets, cleanup ownership, and imported-content data-only boundaries. It preserves the C1.2 API-30 ZIP-buffer fix and native Activity capture correction. No legacy trust is imported and no runtime signature policy is weakened.

## Guarded evidence and remaining gates

Parent commit `ea9074e80df01c58465925558f1f0d7c7959874f` passed actual Android compilation, lint with 0 errors/53 warnings, and 28 JUnit tests. That result applies to C1.2, **not** to C2.2. C2.2 still requires a new actual hosted compile/lint/unit run.

The resolved Gradle graph must pass the unchanged 121-path task allowlist before task actions. Unknown tasks stop for review. Resource/class-library intermediates are distinct from forbidden installable packages. `--continue` permits eligible independent diagnostics after a failure; the original Gradle failure remains authoritative. The final gate independently reports lint, JUnit and forbidden outputs, requiring real nonempty, not-all-skipped JUnit reports. Lint stdout includes up to 200 bounded issues, blockers first, with explicit omitted issue/location counts. It does not print source excerpts or upload reports.

Four instrumentation source files are retained for later review but are **not compiled or run by this workflow**. No emulator or device is involved. Android lifecycle/provider operations, diagnostic cancellation/rotation/process death, imported-content top-level navigation/bridge isolation, complete licensed web assembly, and real-device acceptance remain separate open gates. Old App/data retention and verified export/restore are required before migration acceptance.
