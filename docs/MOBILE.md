# 移动端架构 / Mobile architecture

当前已提供 Android Preview APK；安装与更新以 [ANDROID.md](ANDROID.md) 为准。本文件原来的迁移计划已被实际实现取代。

| 环境 | 运行方式 | 项目保存 |
| --- | --- | --- |
| 手机浏览器 / Mobile browser | 与桌面共用网页和 WebGL | 文件选择属于会话；书签按浏览器网址保存 |
| Android 常规工具 | Capacitor WebView + 打包网页 | 原生项目存储、文件导入、备份和生命周期接口 |
| Android 三维高斯 | OpenGL ES 3 + GLSurfaceView | 原生相机、漫游、项目书签、截图；全量高斯，不提供编辑 |

App 的源文件存入私有目录；项目状态与文件引用由原生存储管理，不把点云写进 localStorage。系统分享 / 文件选择进入导入流程，压缩包解压后保留目录。大文件仍受设备内存、GPU 和存储限制。

网页与 App 的更新层分开：兼容网页包经签名验证后启用；原生渲染器或文件协议的变化需要完整 APK。每次发布同时提供同版本完整 APK 和签名热更新资源。未完成的操作不能依赖退出回调保证保存；卸载前请导出项目备份。

Android Preview is available. Browser tools share WebGL code; Android adds durable local projects and a dedicated native Gaussian viewer. Native Gaussian navigation and views are separate from web editing and camera JSON. Compatible signed web updates and complete APKs are published together. See [the Android guide](ANDROID.md) for setup and limitations.
