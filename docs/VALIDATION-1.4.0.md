# v1.4.0 validation / 发布验证

- 34 JavaScript test files: point readers, original attributes, portable project roundtrip, selection/deletion, camera navigation and save coalescing.
- 7 Android JVM unit tests; 3 release-signing tests.
- 16 Android 11 / WebView 83 instrumentation tests, run in isolated class groups: startup (2), announcements (1), native storage (5), signed updates (6), five-tool Back navigation (1), studio edit/save/reload/restore (1).
- Android compilation targets WebView 60; 21 compatibility scripts parse as ES2017 and offline fallback checks pass. Compilation target is not a guarantee for every device/GPU.
- Desktop browser: synthetic XYZI import, select/delete/restore, intensity retained; English studio UI. Mobile viewport 390×844: no horizontal overflow, project panel collapses and reopens. Existing feature tests cover drawing and Gaussian operations.
- Build checks verify generated assets, all six page versions, release contents and checksums. APK packaging is checked byte-for-byte against the prepared web resources before signing the update manifest.

The combined instrumentation invocation exposed a WebView 83 native crash between Activity lifecycles; each class passed in its own instrumentation process. The Back test now waits for Activity focus after dismissing the diagnostics dialog. This is not a claim of physical-phone validation: QQ sharing, vendor gestures, background process death, very large datasets and live production update activation still need device testing.

本版修复原生桥接将小整数文件偏移误读为 0 的问题，二进制项目恢复已在实际 WebView 中回归。快照采用原子引用替换；不承诺系统瞬间杀进程时最后一笔未完成写入不丢失。跨端通过用户分享文件，不自动上传或云同步。
