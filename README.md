# BuildingWebViewer

[在线打开查看器](https://sen2maker.github.io/BuildingWebViewer/) · [GitHub 源码仓库](https://github.com/Sen2Maker/BuildingWebViewer)

在线版直接打开上述链接即可，无需启动本地服务；进入工具后再选择自己电脑中的文件或文件夹。

用于建筑三维结果检查的轻量网页工具，包含 **LOD 模型查看器、线框模型查看器、独立点云查看器**，以及一个待开发入口。原生 HTML / CSS / JavaScript + WebGL，无 npm 依赖、无在线 CDN。

项目和 ZIP **不包含模型或点云数据**。所有页面都从空白状态开始，不读取默认目录、不恢复上次选择；数据由你在网页中手动选择，在你的浏览器内处理。部署到 GitHub Pages 后也采用相同方式，模型和点云不会上传至 GitHub。

## 推荐：直接双击打开网页

1. **完整解压 ZIP**，保留解压后的所有文件及目录结构。
2. 找到 `index.html`，双击打开。建议使用较新的 **Chrome 或 Edge**；也可以右键选择“打开方式”，再选择浏览器。
3. 在首页选择需要的工具。
4. 点击该工具中的文件或文件夹选择按钮，选择你自己的数据。
5. 在列表中选择要看的对象。LOD 支持勾选多栋；线框和点云页面点击对应 ID 或文件即可，再点同一项可取消。选择目录只建立文件列表，不会自动选中任何对象。

**无需 Python、无需安装依赖、无需联网。** 部分浏览器会把文件选择确认称为“上传”，这里仅允许网页读取你手动选中的本机文件，不会发送到服务器，也不会修改原始文件。

关闭或刷新网页后，需要重新选择文件或目录并勾选对象；这是浏览器文件访问权限的限制，也是工具的初始空选行为。取消最后一项后，画面恢复为空；在 LOD 页面把编号输入框留空并点击“查看这些楼栋”，也会清空选择。

## 三个入口分别选择什么数据

| 工具 | 如何开始 |
| --- | --- |
| LOD 模型查看器 | 点击“选择模型文件夹”，选择含 `.obj` 三角网格的目录，再勾选模型或输入模型编号。 |
| 线框与点云查看器 | 选择数据目录，再选择要看的对象及对应图层。支持按对象编号分子目录存放点云和 OBJ 线框。 |
| 点云查看器 | 手动选择点云文件或包含点云的目录，再选择要显示的文件。 |

线框与点云数据可以按以下结构组织；`<ID>` 表示你自己的对象编号：

```text
数据目录/
  <ID>/
    pc.xyz
    pre_seg.obj
    pre_seg_nms.obj
    raw_topk.obj
  <另一个ID>/
    pc.xyz
    pre_seg.obj
```

OBJ 线框支持 `l` 线段或折线；没有 `l` 时使用 `f` 面的边。LOD 页面用于三角面网格，不自动把任意多边形拆成三角形。

点云支持以下格式：

- `.xyz`、`.txt`、`.csv`、`.pts`：文本点云，前三列为 XYZ，可使用空白、逗号或分号分隔；支持具名属性表头。PTS 可以带首行点数，但必须与实际点数一致。
- `.ply`：ASCII，以及大小端二进制格式。
- `.pcd`：ASCII 或未压缩 binary。暂不支持 `binary_compressed` PCD。
- 暂不支持 LAS / LAZ；请先另行转换为上述格式。

具名 RGB 属性可用于原始颜色显示；没有表头的额外列保留为 `column_4` 等属性，不会自动当成 RGB，可手动指定 R/G/B 对应列。若使用 Point2Contour `pre.py` 导出的 `pc.xyz`，第四列是边缘概率；其他来源请核对字段含义。大点云会按展示上限抽样，界面区分总点数与展示点数；抽样不会改写原文件。

## 备选：启动本机网页服务

如果希望通过本机网址访问，可使用随包附带的静态服务。此方式需要已安装 **Python 3**，无需额外 Python 包，也不需要提前配置数据目录。

在解压后的查看器目录中打开终端，执行以下命令之一：

```bash
bash start.sh
```

或：

```bash
python3 server.py
```

浏览器打开 **[http://127.0.0.1:8765](http://127.0.0.1:8765)**，进入工具首页，然后仍在网页内手动选择数据。服务运行时保持终端打开，按 **Ctrl+C** 关闭。

端口被占用时，可以换端口：

```bash
python3 server.py --port 8766
```

然后打开 **[http://127.0.0.1:8766](http://127.0.0.1:8766)**。`bash start.sh --port 8766` 效果相同。服务只监听本机 `127.0.0.1`，只提供网页程序文件，不读取或提供模型数据；无需也不再使用 `--source` 参数。

## 打不开时先检查这些

- **不要在 ZIP 压缩包内部直接打开网页。** 先完整解压，再打开 `index.html`；不要只复制 HTML 文件。
- **请选择文件或目录，而不是 ZIP。** 模型仍在压缩包中时，先解压模型。LOD 目录应包含 `.obj` 文件；点云工具应选择上述支持的格式。
- **选目录后没有画面：** 目录不会自动选中模型，请继续在列表中勾选对象。取消全部勾选后画面为空是正常行为。
- **刷新后没有数据：** 再次选择文件或文件夹，然后勾选对象。工具不自动恢复旧路径或旧选择。
- **目录按钮或三维画面不可用：** 换用较新的 Chrome / Edge，并确认 WebGL 和浏览器硬件加速可用。
- **本机网址无法访问：** 确认终端服务仍在运行，网址端口与启动命令一致；也可以直接使用“双击打开网页”的方式。

## 程序文件

| 文件 | 用途 |
| --- | --- |
| `index.html`、`hub.css` | 工具首页及样式 |
| `lod.html`、`styles.css`、`viewer.js` | LOD 页面及已生成的浏览器脚本 |
| `wireframe.html`、`pointcloud.html`、`cloud.css`、`cloud-app.bundle.js` | 线框与点云页面、独立点云页面及浏览器脚本 |
| `app.js`、`renderer.js`、`obj-parser.js` | LOD 界面、渲染与解析源码 |
| `cloud-app.js`、`cloud-renderer.js`、`point-io.js` | 线框/点云界面、渲染与解析源码 |
| `server.py`、`start.sh` | 可选的本机静态服务及启动脚本 |
| `build.py` | 从源码重新生成浏览器脚本及程序 ZIP |
| `point-io.test.mjs` | 不依赖外部数据的点云与线框解析测试 |
| `.github/workflows/pages.yml` | GitHub Pages 自动构建与部署 |
| `.gitignore` | 排除生成目录、缓存及常见模型数据文件 |
| `README.md` | 本说明 |

## 修改、验证与打包

正常打开网页无需构建。仓库已包含 `viewer.js` 与 `cloud-app.bundle.js`；它们是生成文件，请修改对应源码后重新生成，并一起提交到 Git。

```bash
# 重新生成浏览器脚本（Python 3，无第三方包）
python3 build.py

# 解析测试与脚本语法检查（仅开发验证需要 Node.js）
node point-io.test.mjs
node --check viewer.js
node --check cloud-app.bundle.js

# 导出静态网站和可分发的完整项目 ZIP
python3 build.py --site --zip
```

- `_site/`：纯网页发布目录，只含 HTML、CSS、浏览器脚本和 `.nojekyll`。每次构建会重新生成此目录，请勿在其中存放数据或手动修改源码。
- `dist/BuildingWebViewer.zip`：可完整解压后使用、修改和重新构建的程序包，不含 Git 历史。
- 两种输出都按明确的文件清单生成，不收集你的数据目录。

## Git 与 GitHub 托管

### 本地 Git

本项目可独立于原来的 Point2Lod2 工程使用。本次建立的本地仓库使用 `main` 分支，已有首次提交；不需要再执行 `git init`。

```bash
git status
git log --oneline -5
```

数据建议放在项目目录外，通过网页的文件选择按钮读取。`.gitignore` 已排除常见模型格式，以及 `data/`、`datasets/`、`models/` 目录；若有 CSV / TXT 等其他格式的数据，也请放在这些目录内或项目外，避免一起提交。

从 ZIP 新解压出来的副本没有 `.git`，如需单独管理该副本，才执行以下命令：

```bash
git init -b main
git add .
git commit -m "Initial BuildingWebViewer project"
```

### 上传代码并部署为网页

本项目的公开仓库是 `Sen2Maker/BuildingWebViewer`，默认分支为 `main`，已启用 GitHub Actions 发布 Pages。维护此仓库时，修改、提交并推送 `main` 即会自动更新网页。

下面的步骤用于在你自己的 GitHub 账号下部署一份副本；现有仓库不需要重复创建或配置。本地初始化 Git 不会自动创建远程仓库，也不会自动上传文件。

1. 登录 GitHub，新建名为 **BuildingWebViewer** 的空仓库。若希望使用免费 GitHub Pages，选择 **Public**。不要勾选初始化 README、`.gitignore` 或 License，因为本地已经有项目和提交历史。
2. 在本项目目录运行下面的命令，将 `YOUR_GITHUB_USERNAME` 替换为实际 GitHub 用户名。推送时使用你已配置的 GitHub 身份验证方式：

   ```bash
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/BuildingWebViewer.git
   git push -u origin main
   ```

3. 在 GitHub 仓库确认默认分支是刚推送的 `main`。打开 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
4. 打开 **Actions → Deploy BuildingWebViewer to GitHub Pages → Run workflow**，选择默认分支运行。首次推送可能因为尚未启用 Pages 而失败，完成第 3 步后重新运行即可。
5. 等待工作流成功。页面地址通常为 `https://YOUR_GITHUB_USERNAME.github.io/BuildingWebViewer/`，准确地址可在 **Settings → Pages** 或部署结果中查看。

以后推送到仓库的默认分支会自动运行解析测试、生成网页并部署。工作流会跟随仓库的默认分支；以后重命名默认分支，不必修改部署文件。其他分支不会发布。

线上使用时直接访问网页，再选择自己电脑中的文件或文件夹。**无需启动 `server.py`，无需把模型复制到仓库。** 页面使用相对资源地址，支持 GitHub Pages 的 `/BuildingWebViewer/` 子路径。

### 费用

按 2026-10-08 查阅的 GitHub 官方说明：

| 用途 | 费用与条件 |
| --- | --- |
| 只保存代码、管理 Git 版本 | GitHub Free 支持免费的公开仓库和私有仓库。 |
| 公开仓库 + GitHub Pages 网页 | 可使用 GitHub Free，使用默认 `github.io` 地址，无需租服务器。 |
| 从私有仓库发布 GitHub Pages | 需要支持此功能的付费计划，例如 GitHub Pro / Team；私有代码仓库本身仍可免费使用。 |

当前工具是静态网页，适合直接使用免费 Pages。个人数据只在本地浏览器里读取，不计入网站发布体积。若以后添加服务端计算、在线数据存储等功能，需要另行安排对应后端。

官方参考：[GitHub 定价](https://github.com/pricing)、[GitHub Pages 与可用计划](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[使用 Actions 部署 Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
