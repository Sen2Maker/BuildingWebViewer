<div align="center">

<h1>BuildingWebViewer</h1>
<p>Inspect building models, wireframes, and point clouds in your browser.</p>
<p><a href="README.md">简体中文</a> · <strong>English</strong> · <a href="https://sen2maker.github.io/BuildingWebViewer/">Live demo ↗</a></p>

</div>

![Point cloud overlay and camera controls](docs/preview.png)

## Quick start

**Online** → [Open the viewer](https://sen2maker.github.io/BuildingWebViewer/), choose a tool, add local files or a folder, then select the objects to display.

**Offline** → Download and fully extract the project, then open `index.html`. No installation required; Chrome or Edge is recommended.

Alternatively, start a local server from the project folder (Python 3 required):

```bash
python3 server.py
```

Open **[http://127.0.0.1:8765](http://127.0.0.1:8765)**. Press `Ctrl+C` to stop; add `--port 8766` if the default port is busy.

## Three viewers

| Tool | Input | Key features |
| --- | --- | --- |
| **LOD models** | Triangulated OBJ meshes | Multiple buildings, solid / wireframe display, height above each model’s lowest point |
| **Building wireframes** | OBJ wireframes + optional point clouds | Folders grouped by object ID, up to three comparison panes, synchronized cameras |
| **Point clouds** | TXT · XYZ · CSV · PTS · PLY · PCD | Multi-file overlays, attribute coloring, geometric features and merged export |

Organize wireframe data as `dataset / object-ID / wireframe.obj, points.txt`. Text point clouds support XYZ and additional attributes, such as `x y z intensity`. LAS / LAZ and compressed PCD are not supported.

**Display · Camera · Bookmarks**: use the side panel to change palettes and value ranges, adjust camera sliders or enter precise values, and save views. Bookmarks stay in the current browser and site, with JSON import and export. The viewer interface is currently in Chinese.

**Data and processing**: Inspect and reorder columns, assign RGB / HSV, normal, intensity or custom tags, compute selected features, and choose where to insert new columns before PLY / TXT export. [Processing guide](PROCESSING.md)

## Essentials

- **Local data**: files are processed in your browser, never uploaded. No model datasets are bundled.
- **Project tree**: drop files or folders, collapse groups, create folders, Ctrl/Shift-select or box-select items, and use the context menu for batch moves/removal. The sidebar can be resized or collapsed. Checked clouds are used for display, processing, and merging. Groups exist for this session only; disk files stay unchanged.
- **Explicit selection**: select objects after opening a folder. Reloading requires selecting your data again; saved bookmarks remain.
- **Large files**: all points are displayed by default, with optional per-file limits and cache reuse. Capacity depends on available RAM and GPU memory.
- **Coordinates**: point cloud overlays preserve original coordinates and require a common coordinate system. LOD models use a rearranged display layout.

## Develop and package

Plain HTML / CSS / JavaScript + WebGL, with no npm dependencies. After editing the source, run:

```bash
python3 build.py --site --zip
```

This updates the browser bundles and creates `_site/` for static hosting and `dist/BuildingWebViewer.zip` for distribution. Commit the generated bundles alongside source changes.

See [design notes](DESIGN_NOTES.md) (Chinese) for implementation details and references.
