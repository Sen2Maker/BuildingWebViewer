# BuildingWebViewer

CAD-free 3D web tools and an Android application, built from Vite sources. The CAD application is maintained separately at https://github.com/Sen2Maker/WebCadToolBox.

## Development

Use Node 22.12+ and Python 3. Run `npm ci --ignore-scripts`, `npm test`, `npm run build`, then `npm run preview`. Sources are in `src/`, generated web output in `dist/`. Do not hand-edit generated assets.

## Android

The application uses the retained Main signing identity and package `io.github.sen2maker.buildingwebviewer`. Version 1.0.0/code2 succeeds the internal code1 builds. Actual-root CI compiles, lints, tests and assembles an unsigned release-variant APK, then verifies package identity and frozen resources. Signing and public release are separate steps; a green source build is not evidence of publication.

External content updates remain disabled. Destructive native cleanup remains disabled. Android may deny creation of hardlink test fixtures: diagnostics report UNSUPPORTED, not PASS, while ordinary single-link storage checks remain separate. A code1 device report verified the corrected restricted-capability semantics; it does not certify every device or recovery scenario. Never uninstall an existing installation containing important data merely to resolve a signing conflict; export and verify backups first.

## Licensing and sources

This repository does not add a license grant for project-owned code. Existing rights are retained; public source availability is not a claim that all code is open-source or freely licensed for commercial use. Third-party components retain their own licenses, notices and source rights; these are not overridden by the project's licensing status. See `assets/mobile/notices.html`, `assets/vendor/NOTICE.txt` and `assets/vendor/main-notices/NOTICE.txt`. Complete version-pinned third-party source archives and build materials are prepared separately for release delivery; do not claim they are published until their actual download links have been verified.

## Publication

The web destinations are https://sen2maker.github.io/BuildingWebViewer/ and https://sen2maker.github.io/WebCadToolBox/. The Main App contains no CAD engine/editor. CAD App downloading remains unavailable until a verified production destination is configured. Release review metadata is not a substitute for component-specific evidence or an authorization to change licenses. Historical migration documents describe earlier states and do not override current runtime restrictions.
