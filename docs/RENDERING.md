# 渲染与截图 / Rendering & capture

三个查看器共用 `src/shared` 下的显示和导出模块：

| 模块 | 职责 |
| --- | --- |
| `render-style.js` | 显示选项、可重复分层抽样、比例尺刻度 |
| `presentation-controls.js` | 按工具能力提供显示控件 |
| `scene-guides.js` | XYZ 朝向、坐标比例尺、实际显示点数 |
| `line-renderer.js` | 复用边端点缓冲的实例化圆柱/方柱 |
| `image-export.js` | 相机截图 UI、离屏位图渲染与 SVG 投影 |

Quick PNG copies the current render at its existing pixel size. Advanced PNG/JPEG/WebP redraws the scene in an RGBA/depth framebuffer, reads the pixels, and restores the live framebuffer in `finally`. Optional 2× supersampling renders twice each dimension and downsamples. Width/height describe the final image; multiple views join horizontally. The orthographic camera preserves vertical framing when aspect ratio changes. JPEG is opaque; PNG and WebP can preserve alpha. Quick capture includes only rendered pixels. Advanced raster export defaults to a clean render and can include enabled XYZ axes, ruler, scalar/surface legend and point count, all drawn by the same overlay module as the live view. HTML buttons and model ID labels are excluded; grid visibility follows the scene setting. SVG remains linework only.

Dimensions are integer pixels, at least 16 per view. Actual render targets must fit the device texture/renderbuffer limits, 8192 per side and 32 Mi pixels total. These are export-allocation safeguards, not scene/model-count limits. 2× supersampling counts its internal pixels toward the same budget. Unsupported encoders or allocation errors produce a message instead of a mislabeled file.

SVG contains real editable line paths, not an embedded screenshot. It exports one view and at most 200,000 segments. It intentionally omits point clouds, filled surfaces, hidden-line removal, gradients, 3D line materials, grid and guides. Use raster export for the rendered appearance. Vector density limits avoid freezing the browser on massive linework.

Point spheres are lit sprites, not tessellated spheres: no sphere-surface depth correction, normal-oriented splats, surface reconstruction or Gaussian splatting. Display sampling builds deterministic jittered index strata and uses the same indices for positions/colors/scalars. It changes neither stored points nor processing/export input. Increasing back to 100% restores all already-loaded points and releases the sampling index buffer. A prior import cap still applies. Sampling is per visible cloud; tiny clouds can round down to zero points.

3D lines use `ANGLE_instanced_arrays` with shared endpoint buffers and a small reusable shape. Unsupported browsers retain thin lines and report unavailable styles. Width is screen-relative; SVG does not reproduce tube shading. Native line width remains browser-controlled. Face lighting uses existing per-face normals, preserving architectural sharp edges; this is not normal smoothing or a PBR/path tracer.

The scale bar measures distances in the orthographic image plane using the data’s coordinate units. No meter assumption is made. Normalized LOD uses synthetic layout units; this is not a geographic measurement tool. The on-screen guide canvas is only 150×160 CSS pixels and is updated on rendering, with no animation loop.

## 参考 / References

MeshLab separates point, wire and solid rendering, including per-face/per-vertex/no-shading choices. We adopt that control structure, with an independent lightweight WebGL implementation (no MeshLab code copied):

- [MeshLab rendering controls](https://github.com/cnr-isti-vclab/meshlab/blob/main/src/meshlab/ml_render_gui.cpp)
- [MeshLab point smoothing settings](https://github.com/cnr-isti-vclab/meshlab/blob/main/src/meshlab/glarea_setting.cpp)

Validation includes deterministic sampling, coordinate projection, size limits, SVG structure, index reuse/data preservation and framebuffer cleanup on errors; browser checks use synthetic fixtures and inspect actual PNG/JPEG/WebP/SVG outputs.

Display sampling has synchronized range and numeric controls; rapid updates are coalesced per animation frame. `cloud-colors.js` provides validated per-file display overrides without changing source attributes or forcing reparse/recenter. Solid color and line-gradient endpoint pickers expose previously fixed colors. [Inspector audit](INSPECTOR-AUDIT.md).
