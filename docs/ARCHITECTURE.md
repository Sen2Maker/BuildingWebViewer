# 工具与模块 / Tools and modules

**工具**是首页中的独立功能入口，目前有五个：网格模型、线框、点云、三维高斯、点云创作与修订。“待开发”是占位入口。

**模块**是工具内部的能力。通用能力放在 `src/shared/`，工具专属能力留在对应目录。

| 工具 | 专属代码 | 主要共享能力 |
| --- | --- | --- |
| 网格模型 | `src/lod/` | 项目管理、相机、书签、显示设置、图片导出、相机动画 |
| 线框 / 点云 | `src/cloud/`，由工具配置区分 | 项目管理、相机、书签、文件读取、点云属性与处理 |
| 三维高斯 | `src/gaussian/`；Android 原生渲染在 `mobile/android/` | 项目、相机文件、诊断；渲染和排序独立实现 |
| 点云创作与修订 | `src/generate/` | 相机、显示、点云读取与导出；画笔与草稿独立实现 |

## 相机动画的复用边界

- `camera-animation.js`：纯数据模型、校验、帧定位、关键帧与插值，无 DOM 和渲染器依赖。
- `animation-controls.js`：时间轴、持久化、导入导出入口，通过适配器操作工具。
- `animation-export.js`：确定性的逐帧输出、取消、恢复相机；视频编码依赖本地离线 vendor。
- `animation-render-target.js` / `zip-writer.js`：可复用离屏渲染目标和流式 ZIP 写入。
- `src/lod/animation-adapter.js`：网格工具适配器，负责相机读写、场景匹配、预览画幅和取帧。

后续接入新工具时实现适配器：`space`、`ready`、`capture`、`assert`、`apply`、`guard`、`canvas`、`createCapture`，可选 `setPreviewAspect` / `drawGuides`。渲染器支持、性能和相机语义需分别验证；目前仅桌面网格工具启用。

现有目录和存档标识保持兼容。新增跨工具能力继续放入共享模块，不复制整套页面或重写存档格式。
