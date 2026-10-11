# 跨端工作 / Cross-platform workflows

一套源码、三个使用入口：电脑网页、手机网页、Android App。语言、绘制、修订与渲染逻辑共用，存储和文件出口由适配器处理。没有云同步，项目通过文件复制、系统分享或压缩包转移。

| 文件 | 用途 | 电脑 / 手机网页 | Android App |
| --- | --- | --- | --- |
| `.bwvproject` | 点云源坐标、属性、颜色、删除状态、绘制配方 | 创作与修订 → 保存 / 打开项目 | 分享文件至 App → 选择项目 → 创作与修订；保存项目调用系统分享 |
| `.ply` / 文本点云 | 修订后的保留点、通用交换 | 对应工具导入 | 分享或项目内导入；导出使用系统分享 |
| 高斯 `.ply`（可选 `cameras.json`） | 高斯源属性和训练相机 | 高斯查看器导入 | 高斯工具读取同一项目内文件 |
| `.bwv.zip` | Android 完整项目、源文件与各工具状态 | 可提取数据文件使用，不恢复整个 App 项目 | 首页导出备份 / 导入恢复 |

`.bwvproject` 不包含会话撤销栈或未完成笔画；删除掩码保留，重新打开后仍可“恢复删除点”。PLY 是输出结果，不包含已删除点。高斯编辑标记保存在 App 快照内，通用 PLY 导出保留所选输出范围及原属性。

网页自动保存属于当前站点/浏览器；换电脑、换端口或清理缓存不会自动迁移。Android 使用项目私有存储，后台请求保存并停止导航，突然杀进程可能丢失最后尚未提交的修改。重要工作应主动导出项目。

## 开发约定

- 共享数学、渲染、解析与导出不依赖平台。
- `workspace-session.js` 对接编辑器原生项目生命周期，`file-save.js` 对接下载 / 系统分享。
- `commitSnapshot` 原子替换快照引用与状态，避免状态指向未写完文件。快照内容按哈希去重；旧字节在用户执行清理时回收。
- nativeApi 是原生能力协议，不等于软件版本或数据格式版本。v1.4.0 使用 nativeApi 6，旧项目保留，旧 App 必须先升级 APK。

Desktop and mobile browsers share portable studio projects with Android. Browser storage is site-local; Android stores each workspace inside its native project. Files move by explicit copy/share, with no server upload or automatic device synchronization.
