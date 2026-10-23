# Proposed main-project source/notice integration

This is an unapplied proposal. Third-party license rights remain separate from any future noncommercial terms for independently owned application code.

## Proposed source delivery

Publish the reviewed source kit alongside the exact binary release only after separate publication authorization and remaining gates close. Keep the original pinned archives, hash manifest, complete preferred source and build references available through a verified recipient-accessible URL. Do not automatically put the approximately 73.5 MB source payload in the APK.

For Mediabunny, retain both the npm payload used for byte reproduction and the full source at commit `d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1`. The full source supplies `shared/*.ts` missing from npm, closing the identified material gap when the kit is actually packaged/made available with a working source notice. Existing video JS reconstruction from npm modules matched the frozen output; this is **not** a full TypeScript compilation test. Follow upstream `package.json`/scripts from the full source to inspect the build, retain exact toolchain choices and the application's `video-writer-entry.js` and `vendor-video.py`. Do not run upstream publish/release commands.

The old `assets/vendor/NOTICE.txt` names a `docs/third-party/` archive that the baseline Web ZIP does not package. The integrated notice should instead point to the verified same-version source download, not a path unavailable to the binary recipient. MPL-covered source and modifications remain under MPL; independently authored files are not automatically relicensed by the minified bundle.

## Proposed notice placement

Copy only approved `overlay/` additions into a new reviewed candidate. Add an accessible link to `assets/vendor/main-notices/NOTICE.txt` from the existing Web and Android notice UI. Keep existing Capacitor, AndroidX and MIT polyfill notices. Include exact Cordova/coroutines NOTICE and relevant original license texts, not merely a generic Apache link.

The Kotlin 2.0.21 and coroutines 1.8.1 material describes a verified historical APK. Reconcile it with the final resolved runtime graph before naming versions in a new release notice. Current final APK resolution is unknown. Kotlin's broad repository license README is evidence only; it includes compiler/tests/platforms that must not be misreported as bundled.

The libarchive source-comment collection follows the pinned wrapper's explicit CMake list. Preserve its original source, patch and file-level notices. Confirm which configured objects/header-derived pieces actually reach the final native binary; do not call this a complete final native SBOM solely because a source archive exists.

## Static zlib: provenance uncertainty, not a proven licensing conflict

The wrapper's exact CMake uses `find_library(Z_LIBRARY libz.a)` with NDK r28b, so the former "Android supplies libz" sentence should not imply there is no distributed zlib code. The obtained r28b platform sysroot notice names 1.2.12, whereas the old native binary contains 1.3.0.1 strings. The kit retains the discrepancy rather than choosing whichever notice is convenient. Preserve the known official zlib notice and investigate any separately licensed optimization notices. The known zlib terms require honest origin, marking altered source and retaining notices in source distributions, not a blanket binary-attribution/source-delivery requirement. A version mismatch alone is not a demonstrated licensing failure or automatic release block; document the uncertainty and decide what further artifact evidence is proportionate. Native byte-identical reproduction is not asserted to be a statutory condition.

## Integration checks

- Resolve final runtime Maven/Gradle artifacts and review license/NOTICE files for the actual versions, including remaining Guava ListenableFuture, annotations and Chromium boundary-interface code.
- Verify new Web/APK/update packages contain all applicable notices and working source links, but no accidental source archive/test media payload.
- Verify CAD engines are excluded from the main package if that is the approved independent-app boundary. A different repository alone does not change packaged bytes.
- Make shared-code ownership and license grants explicit; no license selection or CAD relicensing occurs through this kit.
- Rerun final package/integrity and UI-link checks after authorized integration. No current APK build, native rebuild, signing, upload or publication was performed by this preparation.
