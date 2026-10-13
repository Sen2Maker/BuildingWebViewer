# BuildingWebViewer collaboration rules

- This is a general browser-based 3D toolbox. Describe supported formats and workflows; do not present it as a companion to another repository.
- Source belongs in `src/`; cross-viewer behavior belongs in `src/shared/`. Do not hand-edit generated bundles or generated HTML blocks. Preserve offline use and local-only data processing.
- `package.json.version` is the sole app version source. Keep the three-part version in sync through `python3 build.py`. Camera/bookmark file-format versions are independent and must not be changed just to bump the app version.
- Every future published change, including documentation or UI fixes, needs a new version. Use PATCH for fixes/docs/small refinements, MINOR for compatible features, MAJOR for incompatible saved-data or workflow changes. Never move or overwrite a published tag or asset.
- Before any push, upload, Release publication or deployment: finish the work, run the relevant checks, update `CHANGELOG.md`, and report the proposed version, changes, verification and remaining limitations to the user. Do not treat completion of a local edit as permission to publish. Publish when the user has instructed release of that version; otherwise keep the reviewable result local and await the user's release instruction.
- The user's current explicit request to publish the first v1.0 release authorizes publishing v1.0.0 after the pre-publication report. It is not standing authorization to publish later versions.
- Use `main` as the primary branch. Avoid unnecessary branches or repository-wide rewrites. Never include user datasets, credentials or local absolute data paths in a release.
- Follow `docs/RELEASING.md`. Run `python3 scripts/check.py`, then `python3 scripts/release.py` before publication. Include source and generated assets in the same commit. GitHub Pages is deployed from a published stable Release, not an ordinary push.

- Every new published version, including hot-update-only patches, must include a complete APK built for the same version. Hot updates supplement the APK for installed users; never require new users to install an older APK first. Do not reuse an older APK in a new release manifest.

## Release workflow to reuse

- Once the user authorizes the proposed version, finish publication without asking again for the same release action. Preserve browser/security approval requirements when they actually block an action.
- Reuse the exact tested APK and signed web update when source and bundled web assets have not changed. Documentation-only edits require rebuilding the Web ZIP/checksum, not recompiling or resigning the APK. Verify the existing signature and artifact hashes before uploading.
- Commit source/generated files and an immutable annotated version tag; push main and that tag once. Upload the six release attachments in one batch, then publish the stable Release.
- github-pages now allows main and version tags v*. Release-triggered deployment is the normal path; do not manually dispatch after every release. Inspect the failed job before retrying only if automatic deployment fails.
- Completion means source CI and Pages succeeded, all live entry versions/builds match, the signed live update manifest matches this version, and public APK/update hashes match. Never report success based only on a Release page.
