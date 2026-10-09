# BuildingWebViewer collaboration rules

- This is a general browser-based 3D toolbox. Describe supported formats and workflows; do not present it as a companion to another repository.
- Source belongs in `src/`; cross-viewer behavior belongs in `src/shared/`. Do not hand-edit generated bundles or generated HTML blocks. Preserve offline use and local-only data processing.
- `package.json.version` is the sole app version source. Keep the three-part version in sync through `python3 build.py`. Camera/bookmark file-format versions are independent and must not be changed just to bump the app version.
- Every future published change, including documentation or UI fixes, needs a new version. Use PATCH for fixes/docs/small refinements, MINOR for compatible features, MAJOR for incompatible saved-data or workflow changes. Never move or overwrite a published tag or asset.
- Before any push, upload, Release publication or deployment: finish the work, run the relevant checks, update `CHANGELOG.md`, and report the proposed version, changes, verification and remaining limitations to the user. Do not treat completion of a local edit as permission to publish. Publish when the user has instructed release of that version; otherwise keep the reviewable result local and await the user's release instruction.
- The user's current explicit request to publish the first v1.0 release authorizes publishing v1.0.0 after the pre-publication report. It is not standing authorization to publish later versions.
- Use `main` as the primary branch. Avoid unnecessary branches or repository-wide rewrites. Never include user datasets, credentials or local absolute data paths in a release.
- Follow `docs/RELEASING.md`. Run `python3 scripts/check.py`, then `python3 scripts/release.py` before publication. Include source and generated assets in the same commit. GitHub Pages is deployed from a published stable Release, not an ordinary push.
