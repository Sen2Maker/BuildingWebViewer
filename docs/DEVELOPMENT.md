# Development

No framework or runtime package dependencies. Python 3 serves/builds the app; Node 18+ runs development checks. Users can still open `index.html` directly.

| Location | Responsibility |
| --- | --- |
| `index.html`, `lod.html`, `wireframe.html`, `pointcloud.html` | Stable public entry pages |
| `src/hub/` | Homepage and language switch |
| `src/shared/` | Locale, camera/bookmarks, palettes, sidebar, touch gestures and file drops |
| `src/locales/en.js` | English catalog; Chinese source messages are keys |
| `src/lod/` | Mesh parser, rendering and app orchestration |
| `src/cloud/` | Shared point/wire renderer, streaming I/O, cache and orchestration |
| `src/pointcloud/` | Project tree, columns, geometry computations and export |
| `assets/css/` | Shared and tool-specific layouts |
| `assets/js/` | Generated, tracked offline bundles — do not edit |
| `tests/` | Parser, geometry, cache, camera, project, locale and gesture regressions |
| `scripts/check.py` | One command for regression/build integrity checks |

```bash
python3 build.py --site --zip
python3 scripts/check.py
python3 server.py --port 8765
```

`_site/` is the only deployment payload. `dist/BuildingWebViewer.zip` includes source, tests and ready-to-use assets. Neither includes user datasets. GitHub Actions runs the same checks before deploying the default branch.

## Change rules

- Put cross-tool behavior in `src/shared/`; tools own data selection and coordinate semantics. Keep point-only computations out of the mesh viewer.
- Use named relative imports. The dependency-aware bundler checks cycles and rejects unsupported module syntax; avoid duplicate top-level identifiers across modules in the same bundle.
- Use `t('中文消息', [values])` for dynamic UI. Add the exact source key and matching `{0}` placeholders to `src/locales/en.js`. Static page text is translated at initialization; generated fixed markup uses `localizeHTML()`. User filenames, field names and input values are never translated. No mutation observer runs over the scene or file tree.
- Language precedence: URL `?lang=en|zh`, then browser storage, then Chinese. Internal links carry the locale so file URLs and blocked storage still work. Bookmarks retain their existing storage keys.
- The geometry kernel is self-contained because it also runs inside a Blob Worker. Do not introduce captured imports inside `computePointFeatures`.
- For layout changes, check desktop and phone widths in both languages; verify that visible controls remain reachable, rather than only hiding overflow. Canvas gestures: mouse controls on desktop; one finger rotates, two fingers zoom/pan on touch.
- Keep source and regenerated bundles in the same commit. Run the check command before pushing `main`.
