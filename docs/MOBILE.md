# Android 迁移与发布计划

**状态：设计阶段，尚无可安装或经过手机验收的 APK。** 当前完成的是共享网页功能与 ZIP 导入，不能把浏览器模拟手机尺寸的结果当作真机验证。

## 路线与版本

采用 **Capacitor + 现有 WebGL 查看器**，把构建后的 `_site/` 随 APK 打包，离线运行；保留网页的轻量构建流程。原生代码只负责分享接收、可靠文件存储、系统文件选择、生命周期与系统分享导出。Android 工程放 `mobile/`，使用自己的锁文件，避免让网页用户安装 Android 开发依赖。

- **v1.1.0**：当前尚未发布的网页版本，包括渲染/截图改进、逐点云颜色、ZIP 导入等。本地修改不等于新发布。
- **v1.2.0 测试里程碑**：Android 分享 → 新建项目 → 选择工具 → 查看 → 重启恢复。先通过单独的测试构建或 GitHub pre-release 分发，不触发正式 Pages 部署。
- **v1.2.0 正式版**：真机验收后同一 Release 附网页 ZIP、签名 APK、SHA-256 和迁移说明。只有一次正式发布递增一次版本；不要覆盖已上传附件。

## 手机工作流

1. QQ / 文件管理器“分享”或“用其他应用打开” → BuildingWebViewer。兼容 `ACTION_SEND`、`ACTION_SEND_MULTIPLE`、`ACTION_VIEW` 与 `content://` URI；实际支持情况必须用 QQ 真机验证，不能只依赖 MIME 名称。
2. **先立即接收文件到应用私有临时目录**，记录导入任务。外部应用提供的读取权限可能是临时的，不能仅存外部路径。
3. 默认创建“日期 + 文件名”项目，可修改名称或加入已有项目。用户手动选择 LOD / 线框 / 点云工具，再勾选数据；ZIP 保留目录并显示支持/忽略的文件数量。
4. 首页为项目历史：名称、工具、最近打开时间、大小；支持继续、重命名、导出备份、移入回收站。未命名项目也必须先获得稳定项目 ID，不能仅留在页面内存。
5. 无分享入口时：新建项目或继续历史项目。返回首页只关闭视图，不删除项目。

## 数据、恢复与资源

| 内容 | 保存方式与边界 |
| --- | --- |
| 原始文件 | 应用私有持久目录中的独立文件，流式复制与校验；不要使用 Base64 或 localStorage 存点云 |
| 项目状态 | SQLite 事务记录文件引用、目录树、勾选状态、列标签/顺序、显示颜色、工具、相机与书签；独立 `schemaVersion` |
| 分享暂存 | 导入任务有 pending / committed / failed 状态；重启可重试或清理，不把半份文件列成已完成项目 |
| 自动保存 | 导入/移除/列映射等动作完成时提交；相机与拖动参数短暂合并写入，并在手势结束时提交；界面提示“保存中/已保存/失败” |
| 崩溃恢复 | 临时文件 + 校验 + 原子重命名，随后提交项目事务；保留上一个可读快照。不能只依赖退出或后台回调保存 |
| 空间 | 文件内容哈希去重，项目只保留引用；删除最后一个引用后才回收文件。ZIP 导入成功后默认仅保留解压文件，失败清理临时项；不缓存永久 GPU/解析副本 |
| 后台 | 停止刷新/交互计时，暂停或取消可重建任务，释放非当前场景缓存；久置可释放 GPU 并从项目恢复。系统杀进程不保证收到回调，恢复只依赖已提交数据 |
| 存储不足 | 预检空间，写入失败保留旧项目并提示；不得先删除唯一原始文件再尝试保存。卸载可能清除私有数据，必须提供显式项目备份 |

存储接口应与查看器隔离：`ProjectStore` 管理事务与文件引用，`ImportInbox` 接收系统分享，查看器仅接收 File/Blob 与项目设置。网页当前仍为会话项目；**本轮没有悄悄将所有导入文件写入浏览器长期存储**。

ZIP 网页适配器已位于 `src/shared/zip-import.js`：Store / Deflate、目录层级、CRC、路径检查、串行批次与原子导入；暂不递归解压嵌套 ZIP、不支持加密/分卷/ZIP64，解压总量上限 512 MiB。此限制只针对内存中的解压，独立于点云渲染数。Android 版应优先在原生层流式解压到项目目录，并按剩余磁盘空间检查，不复制数百 MB 跨 JS 桥。

## 构建与发布条件

本机检查：Node 18、JDK 21；未发现 Android SDK / Gradle。当前 Capacitor 8 要求 Node 22+ 与对应 Android SDK 环境，需补齐后才能编译和运行验证。

工程完成后的流程：网页构建 → Capacitor sync → Android lint/单元测试 → assembleDebug → 真机验收 → 使用维护者保管的正式密钥签名 → 验证 APK / 校验和。密钥不得进入 Git；每个 APK 的 `versionCode` 必须递增，`versionName` 与发布版本对应。测试包与正式包应使用不同 applicationId，避免签名不一致导致无法更新。

发布前至少覆盖：QQ 冷/热启动分享、中文/重复文件名、多文件及 ZIP、损坏包、空间不足、取消导入、飞行模式、导入途中/保存后杀进程、项目恢复与删除、后台返回、旧版本升级、截图及项目系统分享。没有真机证据时标记测试版，不宣称全部兼容。

参考：[Capacitor 环境](https://capacitorjs.com/docs/getting-started/environment-setup)、[App 生命周期](https://capacitorjs.com/docs/apis/app)、[Android 接收分享](https://developer.android.com/training/sharing/receive)。

## English summary

The Android app is planned, not implemented or packaged yet. Reuse the offline `_site/` through Capacitor; isolate native sharing, transactional project storage and lifecycle code. v1.1.0 remains the unpublished web candidate; target v1.2.0 for Android after preview builds and real-device testing. Import incoming content URIs immediately, create a durable project before viewing, commit changes incrementally, deduplicate files, and suspend/rebuild disposable rendering resources in the background. Never rely solely on an exit callback. Release only a tested, consistently signed APK alongside the web ZIP and checksums.
