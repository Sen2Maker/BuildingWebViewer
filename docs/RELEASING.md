# 版本与发布 / Versioning and releases

这是一个小型静态网页项目：用清晰的版本、变更记录和验证流程管理，暂不需要复杂分支或服务架构。

## 版本号

`package.json.version` 是唯一来源，构建时同步到四个网页的版本链接与下载包。采用 `主版本.次版本.修订号`：

| 场景 | 示例 |
| --- | --- |
| 修复缺陷、文档更新、小幅界面调整 | 1.0.0 → 1.0.1 |
| 新增兼容功能或查看器 | 1.0.1 → 1.1.0 |
| 不兼容的数据格式或主要工作流变更 | 1.1.0 → 2.0.0 |

一个版本可以包含多次本地修改；每次对外发布必须递增版本。相机 JSON 的格式版本独立管理。已发布的标签和附件不覆盖，发现问题发补丁版本。

## 日常修改

1. 在本地实现变更，把用户可感知的内容记入 `CHANGELOG.md` 的 Unreleased 区域。
2. 选择本次版本号，在更新日志中补上日期、中英文摘要、验证结果和已知限制。
3. 构建并检查，预览中英文、桌面与手机布局；涉及数据操作时验证导入、移除及导出。
4. **先向用户汇报改了什么、版本号、检查结果和限制，再按用户的发布指令上传。** 不再完成一个小修改就自动推送。

## 发布步骤

```bash
python3 build.py --site --zip
python3 scripts/check.py
python3 scripts/release.py
```

构建会拒绝站点文本中的 CRLF，文本需统一为 LF。暂存后还应核对待发布文件与 Git 索引中的字节一致，再创建标签；不能只比较工作目录，以免 Git 自动规范化改变构建指纹或附件哈希。

检查器验证版本、更新日志、网页元数据、发布包和 SHA-256。提交源文件与生成文件后创建同版本的附注标签，例如 `git tag -a v1.0.1 -m "BuildingWebViewer v1.0.1"`，再推送 `main` 和这个标签。

在 GitHub Releases 选择**已有标签**，标题为 `BuildingWebViewer v1.0.1`，粘贴更新日志对应章节。可用 `python3 scripts/release.py --notes` 输出正文。上传：

- `dist/BuildingWebViewer-Web-v1.0.1.zip`：免安装完整包，可直接打开 HTML，也包含源码、文档与测试。
- `dist/SHA256SUMS.txt`：附件校验信息。

GitHub 自动提供标签对应的 Source code ZIP/TAR，不必重复上传源码压缩包。先核对附件，再发布正式 Release；Pages 工作流随后从该标签构建并部署。普通代码推送仅运行检查，不改变在线网站。

发布后检查 Actions 成功、线上版本号正确、Release 附件可下载。回退时可手动运行 Pages 工作流并填写旧的**已发布正式版本标签**，不要移动标签或篡改旧包。构建提供固定文件顺序、时间戳和权限；同一 Python/zlib 环境可以复现同一 ZIP。

## 协作建议

- 缺陷和新功能用 Issues 记录，每项写明现象、期望、复现方式或数据格式；无需上传私人数据。
- 先保持 `main` 简单稳定。多人同时开发时再引入短期功能分支和 PR。
- 当前仓库尚未选择许可证。公开仓库不等于已经授予他人修改、分发权限；由维护者决定许可后，再单独发布相应更新。
- 搜索引擎收录需在站长平台验证和提交；站点地图只是帮助发现网页，不保证收录或排名。

## English summary

Use `package.json.version` as the single source of truth. PATCH covers fixes/docs/small refinements, MINOR adds compatible features, and MAJOR marks incompatible changes. Every public update needs a new version; never overwrite a released tag or asset.

Prepare changes locally, update the bilingual changelog, build/test, and report the version, scope, validation and limits **before uploading**. Publish only under the user's release instruction. Run the three commands above; commit source and generated output together, create/push the matching annotated tag, and publish a Release with its versioned ZIP and SHA-256 file. `--notes` prints release text; `--check-tag vX.Y.Z` verifies that the tag, checkout and version agree.

Ordinary pushes run checks only. A published stable Release deploys Pages from its tag; the manual deployment input accepts a previously published stable tag for rollback. Repository visibility alone does not grant an open-source license: the maintainer should choose one explicitly.

## 更新与缓存

构建生成 `version.json` 和页面内相同的内容指纹。每次进入或普通刷新页面，先绕过缓存校验入口 HTML，再启动查看器；旧入口自动以唯一 URL 重新请求一次，防止跳转循环。脚本/样式和站内导航分别带内容哈希与构建标识。

网页没有更新提示、检查按钮或定时轮询。无网络或检查超过 2.5 秒时使用现有版本；纯文件打开及 Android 内置网页跳过这套网页检查。首次升级旧版可能仍需强制刷新，因为旧缓存中不存在新代码。语言和相机书签保留；网页版文件选择随刷新重置。

发布验证必须包括 Pages 部署成功、线上 `version.json` 与本地一致、四个 HTML 的构建标识正确，不能只以 Release 发布成功判断网站已更新。

## Android 附件（v1.2.0 起）

先运行 `npm --prefix mobile ci`、`python3 mobile/prepare.py`，构建/测试 APK。Release 除完整网页包、校验文件之外，附上 APK 以及 `dist/BuildingWebViewer-Update-vX.Y.Z.bwvupdate`。后者是 App 更新资源，不能用完整源码 ZIP 替代。

Pages 工作流会用锁定依赖重建 App 网页包，校验已上传附件的 SHA-256，确认一致后才提供 `mobile-update.json`。因此必须先上传附件再发布 Release。没有配套附件或校验失败时不部署，不发布无效更新地址。原生接口改变要同时更新代码、构建清单和 `nativeApi`，走 APK 升级。


## v1.3+ 签名发布 / Signed releases

执行顺序：更新版本与 `mobile/update-release.json`（序号递增、双语公告、有效期不超过一年）→ 构建网页与 APK → 用仓库外私钥签名 → 本地验签与测试 → 汇报 → 按发布授权推送/上传。

具体签名命令与密钥规则见 [UPDATE_SECURITY.md](UPDATE_SECURITY.md)。`prepare.py` 只生成 `mobile-update.unsigned.json`，不可上传这个未签名文件。`sign-update.py` 在 APK 构建完成后生成签名 `mobile-update.json`，绑定网页包和 APK。CI 只用公钥验签并核对发布附件，不持有私钥。

附件清单：`BuildingWebViewer-Android-vX.Y.Z-preview.1.apk`、`BuildingWebViewer-Web-vX.Y.Z.zip`、`BuildingWebViewer-Update-vX.Y.Z.bwvupdate`、`mobile-update.json`、两个 SHA256SUMS 文件。Release 正文把 Android 与网页版下载放在前面，更新资源注明“App 自动使用，无需手动下载”。

若 Pages 环境只允许 main 部署，在 Actions 中从 main 手动运行 Pages 工作流，输入已发布版本标签。不要关闭环境保护或重写标签。旧 Release 撤回使用可恢复的“转为草稿”，保留历史标签；不删除/替换旧附件。新版完成部署后再撤回旧版。

纯网页版本允许复用旧的已签名 APK 引用；只要当前清单仍引用某个旧 Release 的安装包，就不能把该 Release 转为草稿。撤回前先检查当前签名清单的 APK 下载地址。
