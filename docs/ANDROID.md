# Android Preview

App 复用三个网页查看器，文件和项目保存在手机内。网页不需要安装 Node 或 Android SDK；下面的依赖仅用于构建 APK。

## 安装与使用

1. 安装 `BuildingWebViewer-v1.2.0-preview.1.apk`。预览版为独立应用，Android 7.0+，需要 Android System WebView 110 或更高版本。
2. 从 QQ 或文件管理器“分享/用其他应用打开”文件或压缩包，选择 **BuildingWebViewer Preview**。也可在 App 内新建项目或导入文件。
3. 选择项目，再进入 LOD、线框或点云。解压后的目录保留；线框和对应点云请放在同一目录。
4. 修改项目树、勾选、属性标签、显示颜色和相机会自动保存。计算结果写入项目；手机关闭应用后可从首页重新打开。
5. 卸载前用“导出项目备份”保存 `.bwv.zip`，以后通过首页“导入文件/压缩包”恢复。回收站可恢复；清空后不能撤销。

支持常见 ZIP/7z/RAR/TAR 及 GZ、BZ2、XZ、ZSTD、LZ4 等压缩过滤器。实际变体受 libarchive 支持范围限制；不支持密码、分卷、嵌套压缩包。原生解压不沿用网页 512 MiB 上限，但需要足够存储空间；大型点云渲染仍受手机内存/GPU 限制。

## 保存与空间

- 文件存到 App 私有目录，不依赖 QQ 临时文件地址。相同内容去重；项目清单原子写入，视图变化约 300 ms 合并保存。
- 已提交的数据在导入失败后保留。完整接收后有恢复记录；接收尚未完成就被杀掉时，需要清理未完成导入并重新分享。
- 后台暂停解压、取消正在进行的特征计算并释放未显示缓存。恢复仅保证已经完成写入的操作，突然断电或杀进程前最后瞬间的操作可能未保存。
- “清理未引用文件”不会删除有效项目/回收站的文件；清空回收站后再回收没有其他项目引用的内容。
- 项目备份包含文件、各工具状态和相机位置。全局相机书签独立保存在 App WebView 中，可以另行导出 JSON。

## 更新策略

App 首页比较内置网页与在线网页版本。`PATCH`（如 1.2.0 → 1.2.1）且 `nativeApi` 兼容时自动下载网页资源；`MINOR/MAJOR` 先弹窗。正在查看项目时不替换页面；在项目首页或下一次启动启用。

下载仅接受本仓库的 HTTPS Release 资源、校验 SHA-256、限大小、拒绝越界路径，完成后原子切换。未成功启动的网页包下次启动回退。原生接口改变时递增 `nativeApi`，必须安装新 APK，不能通过网页热更新新增 Android 权限或原生代码。

更新发布需同时准备 `BuildingWebViewer-web-vX.Y.Z.zip` 与站点 `mobile-update.json`。只有网页版本但没有兼容 App 包时，App 引导打开 Release。断网正常使用内置版本。线上更新链路要在正式发布配套资源后验收，不能用本地编译成功代替上线验证。

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

The Android preview bundles all three viewers for offline use. Share files/archives to the app, select a persistent project, then choose a viewer. Projects use atomic manifests and deduplicated private files; export `.bwv.zip` backups before uninstalling. Completed edits persist, but abrupt process death can lose the last in-flight operation.

Build with Node 22+, Python 3, JDK 21 and Android SDK 36 using the commands above. Compatible patch web bundles update automatically; feature releases ask first, and native changes require a new APK. Debug signing and a separate preview application ID are intentional. Validate QQ sharing, background/process recovery, large files and the published update channel on physical devices before a stable release.
