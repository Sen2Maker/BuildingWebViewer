# Android Preview

从 [最新 Release](https://github.com/Sen2Maker/BuildingWebViewer/releases/latest) 下载完整 Preview APK。网页与 App 共用网格、线框、点云和点云创作工具；App 的三维高斯使用独立 OpenGL ES 3 原生渲染器。

原生高斯直接从项目打开，保留全部源高斯，以可视化、漫游和 PNG 截图为主。移动摇杆控制前后左右，升降沿相机画面上方向；视角摇杆左右转头、上下抬头低头，独立按钮控制左倾 / 右倾。相机数字 / 滑块、灵敏度、项目书签及原生 JSON 可保存恢复。默认旋转中心自动取当前视野中心附近的估计深度；这不是精确表面拾取。网页书签、训练机位与原生书签格式独立。

Install the complete APK from the latest Release. Android adds durable projects and a native full-splat Gaussian workspace with fly navigation, camera controls, persistent views and PNG capture. Native Gaussian editing is not provided. Native and web camera formats are separate; device performance remains hardware-dependent.

## 安装与使用

1. 安装所选 Release 的 `BuildingWebViewer-Android-vX.Y.Z-preview.1.apk`。预览版为独立应用，Android 7.0+，兼容构建目标为 Android System WebView 60+。JavaScript 语法转换与缺失接口回归已加入构建；实际 GPU/WebGL 和厂商内核仍需真机验证。
2. 从 QQ 或文件管理器“分享/用其他应用打开”文件或压缩包，选择 **BuildingWebViewer Preview**。也可在 App 内新建项目或导入文件。
3. 选择项目，再进入网格、线框、点云、高斯或点云创作与修订。解压后的目录保留；线框和对应点云请放在同一目录。
4. 修改项目树、勾选、属性标签、显示颜色和相机会自动保存。计算结果写入项目；手机关闭应用后可从首页重新打开。
5. 卸载前用“导出项目备份”保存 `.bwv.zip`，以后通过首页“导入文件/压缩包”恢复。回收站可恢复；清空后不能撤销。

支持常见 ZIP/7z/RAR/TAR 及 GZ、BZ2、XZ、ZSTD、LZ4 等压缩过滤器。实际变体受 libarchive 支持范围限制；不支持密码、分卷、嵌套压缩包。原生解压不沿用网页 512 MiB 上限，但需要足够存储空间；大型点云渲染仍受手机内存/GPU 限制。

## 手机返回键与手势

在查看器中返回：先关闭已打开的设置/菜单，再保存当前项目并回到 App 项目首页。保存失败会留在当前页，可查看“保存失败”的提示并重试。在首页再次返回才交由系统退出或退到后台。原生弹窗与文件选择器优先处理返回，不会直接关闭 App。页面上的首页按钮使用相同保存流程，保留中英文选择。

System Back closes open settings/menus first, then saves the viewer and returns to project home. Failed saves keep the current page. Back at home leaves the app; native dialogs and file pickers retain their normal Back behavior.

## 保存与空间

- 文件存到 App 私有目录，不依赖 QQ 临时文件地址。相同内容去重；项目清单原子写入，视图变化约 300 ms 合并保存。
- 已提交的数据在导入失败后保留。完整接收后有恢复记录；接收尚未完成就被杀掉时，需要清理未完成导入并重新分享。
- 后台暂停解压、取消正在进行的特征计算并释放未显示缓存。恢复仅保证已经完成写入的操作，突然断电或杀进程前最后瞬间的操作可能未保存。
- “清理未引用文件”不会删除有效项目/回收站的文件；清空回收站后再回收没有其他项目引用的内容。
- 项目备份包含文件、各工具状态和相机位置。全局相机书签独立保存在 App WebView 中，可以另行导出 JSON。

## 更新策略

App 启动只读本地内容，项目先显示，随后延迟进行一次后台更新检查。3 秒内没有有效结果就静默略过，不影响离线使用。首页“版本与更新”也可手动检查、查看当前公告或继续安装已下载 APK。

| 更新 | 行为 |
| --- | --- |
| PATCH 且原生接口兼容 | 验签后自动准备，下次重新启动启用 |
| MINOR / MAJOR 且兼容 | 展示已签名的说明，经同意后准备，下次启动启用 |
| 原生接口不兼容 | 同意后下载 APK，验证包名/版本/文件哈希/安装证书，再打开系统安装界面 |

Android 安装仍需用户确认。Android 8+ 首次需用户允许本 App 安装更新；取消不会更改当前安装。下载提供进度、取消与重新下载；已验证 APK 可稍后继续安装。后台杀进程会中止未完成下载，下次可重新检查，不承诺断点续传。

公告保存在包内，成功进入新版项目首页后展示一次；手动入口可再次查看。只有下载完成不算升级成功，回退不会展示失败版本的成功公告。更新后的网页版本可能高于系统显示的 APK 版本，这是两层版本的正常区别。

当前原生接口为 nativeApi 12；旧原生内核需安装匹配 APK。新客户端只接受内置公钥验证通过的 ECDSA 签名清单，再检查单调序号、有效期、文件哈希、大小和兼容性。验证失败继续使用本地版本，绝不降级为无签名更新。已经安装的可信网页过期后仍可离线运行。详见 [更新安全与发布](UPDATE_SECURITY.md)。


## 启动问题定位

首页可打开“启动诊断”；页面加载失败时也会出现原生“诊断 / Diagnose”按钮。报告包含 APK/本地网页版本、Android/WebView、实际入口、资源检查、最近两次启动事件与错误码，可复制或导出文本。仅保留有限日志，不自动上传；分享前可自行检查内容。

“重试本地首页”重新打开本机 App 项目页；诊断不提供跳往普通网页首页的切换入口。渲染进程退出时需关闭再打开 App。加载失败不等于内核版本过低：v1.2.0/1.2.1 的首页路径缺少 `/`，属于 App 配置错误，v1.2.2 已修复。WebView 60 是兼容目标，不代表所有设备/GPU 已实测。

Startup diagnostics run natively, even when JavaScript fails. Reports stay local and can be copied/exported. Retry the local app home without deleting projects. The older start-path defect was an app configuration error, not proof of an outdated WebView.

## 开发构建

依赖：Node 22+、Python 3、完整 JDK 21、Android SDK（platform 36、build-tools 35/36，SDK 许可需自行接受）。

```bash
npm --prefix mobile ci
python3 mobile/prepare.py
npm --prefix mobile run sync
# 设置 ANDROID_HOME 与 JAVA_HOME，或自行写 mobile/android/local.properties
bash mobile/android/gradlew -p mobile/android :app:assembleDebug :app:testDebugUnitTest
```

APK 在 `mobile/android/app/build/outputs/apk/debug/app-debug.apk`。SDK、JDK、Gradle 缓存、node_modules、生成的 mobile/web、签名密钥与 local.properties 不进仓库。

原生回归测试（需要连接测试设备/模拟器；安装 7z 和 zstd 以生成全部格式样例）：

```bash
python3 mobile/test-fixtures.py
bash mobile/android/gradlew -p mobile/android :app:connectedDebugAndroidTest
```

普通网页检查继续用 `python3 scripts/check.py`。`mobile/prepare.py` 生成独立网页更新包及清单，不自动发布。Android 原生逻辑位于 `mobile/android/.../preview/`；共享项目适配器位于 `src/shared/mobile-project.js`；App 首页位于 `src/mobile/`。

正式发布前要确定独立签名密钥并妥善备份。预览版使用调试签名，不应当作为正式长期升级链的起点。项目自己的许可证仍需维护者决定；依赖版权声明已随 App 收录。

## English

The Android preview bundles all five tools for offline use. The compatibility build targets WebView 60+ (Android 7+) with downlevel syntax and offline polyfills; actual device/GPU compatibility still needs verification. Local startup never waits for GitHub: one deferred background check times out after 3 seconds, silently. Verified web updates are staged for the next launch, with no live reload. Signed web updates, consent-based APK download/verification and local release notes remain enabled. This v1.4.0 release needs one APK upgrade to nativeApi 6; subsequent compatible web changes reuse that native layer. Share files/archives to the app, select a persistent project, then choose a viewer. Projects use atomic manifests and deduplicated private files; export `.bwv.zip` backups before uninstalling. Completed edits persist, but abrupt process death can lose the last in-flight operation.

Build with Node 22+, Python 3, JDK 21 and Android SDK 36 using the commands above. Compatible patch web bundles update automatically; feature releases ask first, and native changes require a new APK. Debug signing and a separate preview application ID are intentional. Validate QQ sharing, background/process recovery, large files and the published update channel on physical devices before a stable release.


## 点云编辑项目 / Editing projects

`.bwvproject` 用于跨端继续点云编辑，`.bwv.zip` 用于 App 整项目备份。网页高斯编辑状态与 App 原生只读高斯工作台不同，导入源 PLY 不会套用网页编辑遮罩。训练相机 JSON 属于网页功能。原生接口兼容时优先提供签名热更新；每次仍附同版本完整 APK，方便首次安装。
