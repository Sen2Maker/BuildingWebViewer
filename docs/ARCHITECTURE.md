# 工具与模块 / Tools and modules

**工具**是首页中的独立功能入口，目前有五个：网格模型、线框、点云、三维高斯、点云创作与修订。“待开发”是占位入口。

**模块**是工具内部的能力。通用能力放在 `src/shared/`，工具专属能力留在对应目录。

| 工具 | 专属代码 | 主要共享能力 |
| --- | --- | --- |
| 网格模型 | `src/lod/` | 项目管理、相机、书签、显示设置、图片导出、相机动画 |
| 线框 / 点云 | `src/cloud/`，由工具配置区分 | 项目管理、相机、书签、文件读取、点云属性与处理 |
| 三维高斯 | `src/gaussian/`；Android 原生渲染在 `mobile/android/` | 项目、相机 / 书签、漫游、导航、导出、诊断；专用镜头、渲染和排序独立实现 |
| 点云创作与修订 | `src/generate/` | 相机、显示、点云读取与导出；画笔与草稿独立实现 |

## 相机动画的复用边界

- `camera-animation.js`：纯数据模型、校验、帧定位、关键帧与插值，无 DOM 和渲染器依赖。
- `animation-controls.js`：时间轴、持久化、导入导出入口，通过适配器操作工具。
- `animation-export.js`：确定性的逐帧输出、取消、恢复相机；视频编码依赖本地离线 vendor。
- `animation-render-target.js` / `zip-writer.js`：可复用离屏渲染目标和流式 ZIP 写入。
- `src/lod/animation-adapter.js`：网格工具适配器，负责相机读写、场景匹配、预览画幅和取帧。

后续接入新工具时实现适配器：`space`、`ready`、`capture`、`assert`、`apply`、`guard`、`canvas`、`createCapture`，可选 `setPreviewAspect` / `drawGuides`。渲染器支持、性能和相机语义需分别验证；目前仅桌面网格工具启用。

现有目录和存档标识保持兼容。新增跨工具能力继续放入共享模块，不复制整套页面或重写存档格式。

## 共享设置与适配边界

| 能力 | 共享实现 | 边界 |
| --- | --- | --- |
| 显示与配色 | `render-style.js`、`palettes.js`、对应 controls | 记住可跨数据使用的外观；标量范围、采样比例和设备相关线型不写入跨工具偏好 |
| 相机、书签与手感 | `camera-controls.js`、`camera-navigation.js`、`fly-camera.js`、`viewer-projection.js` | 原始世界坐标与网格排列坐标分开校验；投影切换保留目标平面的垂直视野 |
| 高斯相机组合 | `src/gaussian/camera-controls.js` | 组合共享控件与专用镜头；可选归一化焦距保留训练机位，旧书签原始缓存不删除 |
| 项目树与侧栏 | `project-tree.js`、`sidebar.js`、`point-drop.js` | 管理选择与显示勾选分离；鼠标框选不占用触屏滚动；电脑 / 手机折叠状态分别保存 |
| 文件出口 | `file-save.js` | 网页下载、App 系统分享；图片与相机 JSON 走同一出口 |
| 项目保存生命周期 | `mobile-lifecycle.js`、`autosave.js`、`mobile-project.js`、`workspace-session.js` | 合并网页可见性和原生暂停事件，恢复时重试；异步写盘前冻结元数据 |

浏览器存储只在同一来源内共享，不是跨设备同步。相同世界坐标系的书签可跨工具使用，但不同数据坐标系不会自动配准。网格排列书签与原始坐标书签不能混用。

Android 原生高斯继续使用独立 OpenGL 渲染器与原生界面。共享网页代码不会取代它，也不承诺网页与原生书签缓存自动互通；原生界面修复需要新 APK。相机动画仍仅在桌面网格工具启用。

Portable preferences exclude sampling and dataset-specific scalar ranges. Shared browser camera modules preserve optional calibrated lenses and validate coordinate spaces. Android Gaussian rendering and UI remain native adapters; browser storage is origin-local, not cross-device synchronization.
