# Source delivery for the public M1.1 CI snapshot

This document accompanies the real compiled JavaScript files in this **public CI source snapshot**. It supplies the verified same-version source directions below without changing the independently frozen M1.1 payload. No source archive binary is added to the repository.

For this CI delivery, these directions **supersede the authored incomplete-source statements** in the frozen `assets/vendor/NOTICE.txt` and `assets/vendor/main-notices/NOTICE.txt` that point only to an npm tarball or say the public source URL is pending. They do not replace, narrow or amend upstream license/copyright notices. They do not claim a completed final APK dependency inventory, a production release, or resolved native-source/notice questions not covered here.

## Mediabunny 1.61.4: complete preferred source

The main payload contains `assets/vendor/video-writer.js`, 238,027 bytes, SHA256 `110222db89cafd4c3b3f5886ce163eb2bf49962b18a525cdbe296352f5a6c37c`. It contains Mediabunny 1.61.4 encoding/container-writing code, copyright 2026-present Vanilagy and contributors, under the Mozilla Public License 2.0. Its covered source retains MPL rights, including modification and redistribution under MPL; no noncommercial restriction is imposed on it by this CI snapshot.

- [Retained MPL-2.0 license](project/mobile/android/app/src/main/assets/public/assets/vendor/MEDIABUNNY-LICENSE.txt).
- [Complete preferred source archive at immutable commit d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1](https://codeload.github.com/Vanilagy/mediabunny/tar.gz/d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1).
- Archive filename: `mediabunny-d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1.tar.gz`.
- Archive size: **64,666,092 bytes**.
- Archive SHA256: **c31e30589bc061b44a1c495346446f59e63a59dcfccb09c8e7aa7570a86dc694**.
- [Browse the complete immutable source tree](https://github.com/Vanilagy/mediabunny/tree/d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1).

The archive's `package.json` identifies version 1.61.4. It includes the preferred TypeScript for [shared/bitstream.ts](https://github.com/Vanilagy/mediabunny/blob/d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1/shared/bitstream.ts), [shared/aac-misc.ts](https://github.com/Vanilagy/mediabunny/blob/d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1/shared/aac-misc.ts) and [shared/ac3-misc.ts](https://github.com/Vanilagy/mediabunny/blob/d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1/shared/ac3-misc.ts), which are omitted from the npm tarball. The npm tarball alone is **not** represented here as complete preferred source.

Download the complete archive directly, then compare its byte count and SHA256 with the values above before using it. The URL returned HTTP 200 to an anonymous bounded HEAD request on 2026-10-21; the archive bytes and required TypeScript members were independently checked locally. Availability is a check at that date, not a promise of permanent upstream service uptime.

### Project bundling materials

The existing repository already supplies the matching [project entry](https://github.com/Sen2Maker/BuildingWebViewer/blob/a3b718d609da18751187030246a92098b502454e/src/vendor/video-writer-entry.js), [rebuild script](https://github.com/Sen2Maker/BuildingWebViewer/blob/a3b718d609da18751187030246a92098b502454e/scripts/vendor-video.py) and [pinned package metadata](https://github.com/Sen2Maker/BuildingWebViewer/blob/a3b718d609da18751187030246a92098b502454e/docs/third-party/mediabunny.json). Their bytes match the materials used in the audit. The script takes the integrity-pinned npm distribution as a bundling input and uses esbuild 0.28.2; the complete upstream TypeScript archive above is supplied in addition for preferred-source access. The audited rebuild of that npm-derived bundle was byte-identical to the snapshot. This is not a claim that a fresh complete TypeScript-to-bundle rebuild was performed here. CI does not execute this optional rebuild script.

## Other reviewed compiled browser components

The real payload also incorporates the following MIT-licensed runtime components. Version-pinned upstream package/source links are copied from the exact mobile lockfile; package integrity values remain in [package-lock.json](project/mobile/package-lock.json), and corresponding license texts are retained under [assets/mobile/licenses](project/mobile/android/app/src/main/assets/public/assets/mobile/licenses).

- [Capacitor core 8.5.3](https://registry.npmjs.org/@capacitor/core/-/core-8.5.3.tgz).
- [core-js 3.50.0](https://registry.npmjs.org/core-js/-/core-js-3.50.0.tgz).
- [resize-observer-polyfill 1.5.1](https://registry.npmjs.org/resize-observer-polyfill/-/resize-observer-polyfill-1.5.1.tgz).
- [abort-controller 3.0.0](https://registry.npmjs.org/abort-controller/-/abort-controller-3.0.0.tgz).
- [event-target-shim 5.0.1](https://registry.npmjs.org/event-target-shim/-/event-target-shim-5.0.1.tgz).

The [Capacitor Android 8.5.3 source package](https://registry.npmjs.org/@capacitor/android/-/android-8.5.3.tgz) and all application-specific [pinned native overlays and retained MIT notice](project/mobile/native-patches) are separately available. These source pointers do not assert that every lockfile/build dependency is packaged in a final app. Source availability and original third-party permissions are not replaced by any prospective application license.

The reviewed non-CAD scope does not add a CAD GPL/LGPL engine or font. Native AAR/transitive runtime resolution, static NDK provenance, all final APK notices and application licensing remain separate release-review gates. This source-delivery document closes the identified Mediabunny preferred-source direction gap for **this CI snapshot** only.
