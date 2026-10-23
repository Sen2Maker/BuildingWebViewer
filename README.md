# BuildingWebViewer: Vite and native App source candidate

This root is a locally validated source-migration candidate, not a published v1.0 release, deployed Pages update, signed APK, or device acceptance. Version 1.0.0 is the existing candidate version; no release or tag is created here.

## Web development

Use Node 22.12+ and Python 3. Run `npm ci --ignore-scripts`, `npm test`, `npm run build`, then `npm run preview`. Vite source is in `src/`; generated output is `dist/`. Do not hand-edit output or serve the repository root as the built site.

The configured project homepage is https://sen2maker.github.io/BuildingWebViewer/ and the separate CAD website is https://sen2maker.github.io/WebCadToolBox/. These links do not transfer drawings. The Main App intentionally includes no CAD engine/editor, and the CAD App download remains unavailable until a production package exists.

## Native source

`mobile/` preserves the M2 native implementation already compiled/tested on the isolated native CI branch, with a freshly reassembled web payload correcting production link metadata. The refreshed generated payload has not had a new hosted Android compile. Run `python3 scripts/check-root-native.py` to check the 394 refreshed source/payload identities. This does not rebuild Android or assert a new APK exists. Existing compile-only CI remains under `ci/native-c/`; root identity checking binds the promoted source to its refreshed local manifest; focused tests also retain unchanged native implementation against the original M2 snapshot. External updates remain disabled. Destructive native trash/lifetime cleanup is not enabled by this migration.

## Publication boundaries

Main source CI runs tests, Vite build and native identity checks only. Pages deployment is manual and still fails closed at `npm run release:check`. No push triggers release publication, signing or APK creation. Application terms, complete third-party source delivery and native acceptance have not been claimed resolved. Preserve all third-party notices and their original grants; this migration selects no new license.

`docs/migration/ROOT_MIGRATION.md` explains provenance, retained historical docs and replaced legacy entry/build paths. Historical documents are retained as evidence and may describe the previous App, updater or build chain; they do not override the current disabled-update contract.
