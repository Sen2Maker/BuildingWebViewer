# C2 exact Capacitor overlay

Use only `python3 scripts/apply-capacitor-root-lock.py` against the lockfile-pinned Capacitor Android 8.5.3 installation. It verifies all package/source/helper pins before writing any payload and accepts upstream, audited C1 migration inputs, or the final C2 outputs. Rerunning is idempotent.

`capacitor-8.5.3-hashes.json` and `helper-hashes.json` are the authoritative build inputs. `patched/`, the process guard and the three data-only helpers are the exact copied sources. The included upstream MIT notice remains required.

`capacitor-8.5.3-root-lock.patch` is retained C1 provenance, not the complete C2 patch and not a build command. The C2 content delta is separately retained as `capacitor-8.5.3-content-security.patch`. Do not apply either textual diff on top of an unknown dependency version or replace the exact hash preflight with a fuzzy patch.

C2 removes origin-wide document-start injection. Every trusted HTML entry must have literal lowercase `<head>` and `</head>` for Capacitor's trusted-stream injector. Imported data/media routes are not inventory resources and never receive bridge injection. They remain data-only responses with strict type/CSP/header/navigation boundaries. This is not a replacement for native file authorization or protection against trusted application code evaluating imported bytes.

No Android runtime security acceptance is implied by portable policy tests. Actual WebView instrumentation is still required.
