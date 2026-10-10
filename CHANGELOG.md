# 更新日志 / Changelog

每次对外发布都使用独立版本；已发布的标签和程序包保持不变。Every public release has a unique, immutable version.

## [Unreleased]

后续变更先在此记录，完成验证与变更汇报后再发布。Record upcoming changes here before review and publication.

## [1.2.0] - 2026-10-10

网页正式更新，附带 Android 预览测试版 / Stable website release with an Android preview attachment.

- 新增 Capacitor Android App：离线内置三个查看器、分享/文件管理器导入、项目首页与历史记录。
- 原生流式解压常见 ZIP、7z、RAR、TAR、GZ、BZ2、XZ、ZSTD 等格式；不支持密码、分卷或嵌套压缩包。RAR 变体以 libarchive 能力为准。
- 原子保存项目清单、去重存储源文件；自动保存项目树、勾选、属性标签、颜色与相机，计算结果写入项目。导出/恢复项目备份，提供回收站与空间清理。
- 返回后台暂停解压并取消计算；中断导入保留恢复记录。持续读取采用分块接口。恢复只覆盖已完成保存的操作。
- App 检查网页版本；同主次版本且兼容原生接口的补丁自动安装网页资源，功能版本征求同意，原生变更引导安装 APK。校验官方 HTTPS 地址及 SHA-256，更新失败不替换旧版，启动失败可回退。
- 包含普通刷新的缓存修复；网页不显示任何更新提示。
- 预览 APK 使用独立应用标识与调试签名，尚未发布正式版；QQ 真机分享及设备后台行为需真机验收。

- Offline Capacitor Android app with project history, file/share import and all three viewers.
- Native streamed archive extraction, atomic project state, content deduplication, persistent computed results, project backup/restore and trash/cleanup.
- Background extraction pauses; interrupted imports retain recovery receipts. Bounded bridge reads avoid copying entire text clouds to JavaScript.
- Compatible patch web updates install automatically at project home; feature updates ask first, native changes require APK installation. Official-host and SHA-256 checks, staged activation and startup rollback.
- Includes silent website refresh cache correction. Preview uses a separate package ID and debug signing; real-device QQ sharing remains to be validated.

## [1.1.1] - 2026-10-10

网页修复记录，合并入 v1.2.0，未单独发布 / Website fix record, included in v1.2.0; not separately published.

- 修复普通刷新可能继续使用旧 HTML：启动时绕过缓存校验构建标识，旧入口自动重新请求，验证后才加载查看器脚本。
- 增加内容构建指纹、站内导航版本标识；本地服务器响应使用 no-store。
- 网页不添加更新提示、轮询或检查按钮。防止自动跳转循环；无网络或检查超过 2.5 秒时继续使用现有版本。保留语言和相机书签。
- 第一次从没有此机制的旧版迁移可能仍需强制刷新。离线包需手动替换；普通刷新仍会重置网页版未保存的文件选择。
- Fix stale HTML after ordinary refresh: validate an uncached build manifest before loading viewer scripts, automatically refetch outdated entry pages, and version internal navigation.
- Content fingerprints and no-store local responses. No update banners, polling or check buttons on the website. Redirect-loop protection and bounded offline fallback preserve usability and stored preferences.
- The first migration from older code may require a hard refresh. Offline packages need manual replacement; normal refresh still resets the web session's file selection.

## [1.1.0] - 2026-10-10

网页正式更新 / Stable web release. Android App remains in development.

### 中文

- 显示点比例提供滑块与数字联动，按动画帧合并更新；明确区分显示比例与文件读取上限。
- 高级截图可选纯净画面或已开启的辅助信息；方向、标尺、图例、点数分别开关。快速 PNG 只保存所有可见视窗的渲染像素。
- 点云可逐文件指定显示颜色与恢复全局规则，不重新解析数据、不改变源 RGB/HSV；点云/线框提供全局单色拾色器，立体线可选择渐变终点颜色并禁用不适用选项。
- 三个工具共用 ZIP 导入，保留目录、校验 CRC 与路径，防止部分失败导入；普通 Store/Deflate，解压合计不超过 512 MiB，暂不支持加密/分卷/ZIP64。
- 补充右侧设置核对表与 Android v1.2.0 迁移/持久项目/分享导入计划；本版不包含 APK，网页项目仍为会话状态。

- 相机面板集成快速 PNG 截图和高级 PNG/JPEG/WebP 导出：自定义像素、透明背景、压缩质量、2× 超采样及可见视窗拼接。高级模式使用独立帧缓冲重绘并恢复当前显示。
- 线框与 LOD 可导出真正的 SVG 线框投影；不包含点云、实体面、遮挡或立体线材质，界面明确标注范围。
- 共享 XYZ 朝向与坐标比例尺，保留网格开关；比例尺不假定米制，归一化 LOD 显示布局单位。
- 点云新增圆点、方点、拟球光照及 1–100% 可逆显示抽样，明确实际显示点数；原始属性、计算和数据导出不受影响。
- 线框与 LOD 边线新增实例化圆柱/方柱、线宽与端点渐变；LOD 面新增无光照、柔和及高光显示。

- 三个查看器新增按需运行状态面板：近似 JS 堆内存、几何缓冲数据量、界面刷新率与场景数据规模；不声称测量整机 CPU/GPU 或总显存。
- 三个查看器使用同一个项目栏模板：文件/文件夹导入、拖放提示、搜索、数量、项目树与管理入口位置一致。
- LOD 编号批选与来源信息默认折叠；增加按当前筛选全选/反选，取消固定的 24 栋预览上限。
- 编号范围按已导入模型匹配，避免误输入极大范围时生成海量不存在的编号。
- 顶部数量明确为项目总条目；LOD 不再显示容易误解的 `0 / 24`。
- 三个查看器的“项目”按钮统一放在“立体”左侧，可直接展开或收起项目栏，不再占用额外侧边栏；左上角明确为“首页”，收起侧栏时保留可用的键盘焦点。
- 页脚作者链接显示账号 Sen2Maker，保持中英文和手机布局一致。
- 移除线框和点云查看器顶部图标的矩形底色，与 LOD 查看器统一为透明背景。

### English

- Synchronized display-percentage slider/number controls with frame-coalesced updates; distinguish sampling from per-file read limits.
- Advanced raster export selects clean render or enabled overlays. Axes, ruler, legend and count have independent toggles; quick PNG copies only all visible rendered views.
- Per-cloud display color overrides/reset preserve source RGB/HSV and geometry caches. Add global solid-color and gradient-end pickers; disable inapplicable line controls.
- Shared folder-preserving ZIP import with CRC/path validation and atomic batch insertion. Store/Deflate only, up to 512 MiB expanded; encrypted, split and ZIP64 archives are unsupported.
- Document inspector audit and v1.2.0 Android sharing/project-storage roadmap. No APK is included; web projects remain session-based.

- Shared camera capture: quick PNG and advanced PNG/JPEG/WebP, exact pixel sizes, transparency, quality, 2× supersampling and joined visible views. Offscreen rendering preserves the live view.
- Genuine SVG wireframe projection for wireframe/LOD viewers, with explicit limits: no point clouds, surfaces, occlusion or 3D line materials.
- Shared XYZ orientation and coordinate ruler alongside the existing grid toggle; never assumes meters, uses layout units for normalized LOD.
- Disc, square and sphere-shaded point sprites with reversible 1–100% display sampling and visible counts; source attributes, calculations and data exports stay unchanged.
- Instanced cylindrical/square-prism edges, width and endpoint gradients in wireframe/LOD; unlit, soft and glossy LOD surface shading.

- Add shared on-demand runtime diagnostics: approximate JS heap, geometry buffer bytes, sampled UI refresh and scene data counts; no claims of system CPU/GPU or total VRAM measurement.
- One shared project-sidebar template aligns import, drop hint, search, counts, tree and management controls across all viewers.
- Collapse LOD-specific ID selection and source details. Add filtered select/invert actions without the previous fixed 24-model preview limit.
- Resolve ranges against imported model IDs without allocating huge numeric intervals.
- Label total project items clearly; replace the ambiguous LOD `0 / 24` counter.
- Place the shared Project toggle before the 3D view controls in all three viewers, without an extra side rail; keep Home at the upper left and preserve usable keyboard focus when collapsing the sidebar.
- Display Sen2Maker as the author link in both languages and responsive layouts.
- Remove the rectangular backgrounds behind wireframe and point-cloud header icons to match the transparent LOD icon.

Validation: regression suites and generated-asset/package checks passed; desktop/mobile Chinese/English UI, 25-model display, filtered selection, removal, wireframe/point imports and runtime counts verified. Wireframe still previews one building group; multiselect manages entries rather than overlaying buildings.

## [1.0.0] - 2026-10-09

首次正式版本 / First stable release.

### 中文

- 提供 LOD 模型、通用 OBJ 线框和点云三个查看器，支持在线及离线运行，数据在本机处理。
- 共用项目文件树：追加导入、目录分组、多选/框选、右键移动与移除。
- 点云支持多文件叠加、RGB/HSV 与自定义属性映射、按需几何特征计算、列顺序调整及合并导出。
- 提供色带、相机微调、浏览器书签和 JSON 导入导出；线框支持最多三个同步对比面板。
- 中英文界面、语言加载提示、手机布局和统一工具图标。
- 完善双语项目介绍、搜索描述、规范网址和站点地图；网页增加作者主页、仓库及版本链接。
- 建立统一版本号、发布检查和更新日志；发布正式 Release 后再部署网站。

### English

- Three online/offline viewers for LOD meshes, general OBJ wireframes and point clouds; all data processing stays local.
- Shared project tree with appended imports, folder groups, multiselect, box selection and context actions.
- Point-cloud overlays, RGB/HSV and custom attribute mapping, selected geometric computations, column ordering and merged export.
- Palettes, camera controls, persistent browser bookmarks and JSON import/export; up to three synchronized wireframe comparison panes.
- Chinese/English UI, localized startup feedback, mobile layouts and consistent tool icons.
- Bilingual project and search descriptions, canonical URLs, sitemap, author/repository links and version links.
- A single version source, release checks and changelog; website deployment follows a published stable Release.

### 使用 / Download

下载 `BuildingWebViewer-v1.0.0.zip`，完整解压后双击 `index.html`；也可运行 `python3 server.py`。`SHA256SUMS.txt` 用于验证下载内容。ZIP 包含可直接运行的网页、源码、文档和测试，不含用户数据。

Download `BuildingWebViewer-v1.0.0.zip`, extract everything and open `index.html`, or run `python3 server.py`. Verify the download with `SHA256SUMS.txt`. The archive includes ready-to-run pages, source, docs and tests, without datasets.

### 已知限制 / Known limitations

- 暂不支持 LAS/LAZ 和压缩 PCD；大数据容量取决于设备内存与显卡。LAS/LAZ and compressed PCD are unsupported; large datasets depend on RAM/GPU capacity.
- 刷新后需重新导入文件；项目文件夹仅在当前会话保留，书签可持久保存。Files must be reimported after refresh; project folders are session-only, while bookmarks persist.
- LOD 使用展示排布；点云保留原始坐标；线框每次预览一个建筑组。LOD uses a display arrangement; clouds retain original coordinates; wireframe previews one building set at a time.

[Unreleased]: https://github.com/Sen2Maker/BuildingWebViewer/compare/v1.0.0...main
[1.0.0]: https://github.com/Sen2Maker/BuildingWebViewer/releases/tag/v1.0.0
