# 更新日志 / Changelog

每次对外发布都使用独立版本；已发布的标签和程序包保持不变。Every public release has a unique, immutable version.

## [Unreleased]

后续变更先在此记录，完成验证与变更汇报后再发布。Record upcoming changes here before review and publication.

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
