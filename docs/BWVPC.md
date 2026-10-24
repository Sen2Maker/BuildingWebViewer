# BWVPC v1 · 渐进点云试验格式

BWVPC 是「JSON 八叉树索引 + 二进制点块」组成的目录格式。本版服务于现有 Mesh 查看器（`lod.html`）中的在线点云与 mesh 双视窗对比。它还不是行业标准，也不替代原始 XYZ/PLY 等交换文件。每个源数据行恰好分配给一个树节点，逐层叠加后覆盖全部源点；坐标以局部原点加 Float32 偏移保存，属于有界精度编码。

## 组织与采样

- 新打包默认根节点优先覆盖整个对象，最多 8,000 点（可配置）。不足这个数量时保留所有点。
- 采样采用自适应空间体素，在每个占用体素中选择一个已有点，不生成平均点。目标是空间覆盖均匀，不保证每个体素的原始密度或每块点数相同。
- 将已选源行从待分配集合移除，再按包围盒中点划分八个子空间。新打包默认子节点最多 8,000 点（可配置），重复同样的步骤。
- 父节点与子节点是增量关系：加载子节点时保留父节点，不能使用替换式 LOD 绘制，否则会丢点。
- 节点 ID 是 `r`、`r0`…`r7`、`r00`…；八分区编号为 `(x >= midX) + 2*(y >= midY) + 4*(z >= midZ)`。
- 不同源行若本来就有相同坐标，仍视为独立源点。本版的“不重复”指同一个源行不会被重复写入多个节点，不偷偷去除源数据中的重复坐标。

## 更细分块与容量边界

每个区域仍最多八个直接子区，继续向下分可形成 64、512 等更多区域；只为实际有剩余点的区域生成文件。文件数量由空间分布和点数共同决定，不承诺固定树深或每层全满。

新默认根/子节点均为 8,000 点，因此单块最多 `64 + 8,000 × 12 = 96,064` 字节。可用 `--root-points`、`--node-points` 调节；允许 1–120,000 点，较小参数增加请求数量和索引开销。此前上传的 12 万/6 万配置继续可读；更改打包默认值不会自动改写服务器数据。

读取器接受最多 4,096 节点、32 层、5 MiB 单棵树索引，单云仍最多 1,000 万点。格式版本和二进制布局不变。新树若超出旧读取器的 128 节点/16 层/1 MiB 限制，需要先更新网页读取器。大量完全重合点可能用尽深度；此时明确失败并清理本次新建的树，需增大块预算或按区域/数据集拆分，不能丢点来凑限制。

## 目录结构

```text
building/
  cloud.bwvpc.json
  r.bpc
  r0.bpc
  r1.bpc
  r00.bpc
  ...
```

`cloud.bwvpc.json` 包含 `format: "BWVPC"`、`version: 1`、`refinement: "additive-disjoint"`、`pointCount`、`bounds`、`root: "r"` 和 `nodes`。

每个节点包含：

| 字段 | 含义 |
| --- | --- |
| `id`, `path` | 节点名及同目录的 `<id>.bpc` 文件 |
| `points` | 本节点新增点数 |
| `subtreePoints` | 本节点与所有后代的点数之和 |
| `bounds` | 本节点整个子树的原始坐标包围盒，`[[minX,minY,minZ],[maxX,maxY,maxZ]]` |
| `bytes`, `sha256` | 二进制块的准确字节数及 SHA-256 |
| `children` | 最多 8 个直接子节点 ID |

索引只引用同目录中的规范节点名，不能跳目录、嵌入凭证或重定向。读端检查连通性、节点唯一性、父子关系、包围盒包含、点数总和以及每块校验值。分区的源行归属由写入器完整检查；仅靠计数和包围盒不能证明任意第三方文件没有重复点。

## 二进制块

所有数值采用 little endian。固定 64 字节头后紧接逐点 XYZ 偏移，每点 12 字节。

| 偏移 | 字节 | 内容 |
| --- | ---: | --- |
| 0 | 8 | ASCII `BWVPC001` |
| 8 | 4 | uint32 点数 |
| 12 | 4 | uint32 flags，v1 必须为 0 |
| 16 | 24 | 三个 Float64 局部原点 X/Y/Z |
| 40 | 4 | uint32 记录长度，v1 必须为 12 |
| 44 | 20 | 保留区，必须为 0 |
| 64 | 12 × 点数 | Float32 dx/dy/dz |

还原坐标为 `origin + offset`。读端先还原为 Float64，再沿用渲染器的共享原点，避免大地坐标直接存 Float32 造成精度损失。当前转换器要求最大坐标误差不超过 0.0001 个坐标单位；本数据单位为米，对应 0.1 mm。v1 只包含 XYZ，不含 RGB、强度、法向量或 CRS 标识；不能用它声称无损保留那些属性。

## 加载流程

在线数据接入现有 Mesh 查看器及其双视窗布局。进入带配置的 `lod.html` 链接时，模式标识显示“在线模式”。桌面左窗展示点云、右窗展示 mesh；手机窄屏改为上方点云、下方 mesh。建筑切换与点云细化控件添加在原页面内，工具栏中间共用上一栋／下一栋。普通本地入口继续使用原有文件导入流程。

1. 下载建筑目录及当前建筑的树索引，不预下载整个资源集合。
2. 显示当前 mesh 和点云根节点。
3. 按广度优先顺序，一次请求一个补充节点。单块通过长度、哈希、头结构和坐标检查后，由 Worker 解码并立即追加到画面。
4. 已显示节点的 GPU 缓冲区复用。追加细节不重置相机，不拼接整个原始点云文件。
5. 暂停、旋转/缩放开始、页面隐藏或切换建筑会停止细化；切换建筑还会释放旧场景。暂停时正在下载的单块可在继续时重试，已经显示的节点不重复加载。
6. 窄屏首轮预算为 500,000 点，桌面为 2,000,000 点；达到预算时暂停。用户点击继续可每次增加 500,000 点，当前安全上限为 10,000,000 点。Save-Data / 2G 默认只显示根节点，细化由用户开启。

单请求队列随真实下载速度自然推进，不使用估算网速一次发出大量请求。当前还没有屏幕误差优先调度、视锥剔除、按空间区域卸载/重载、持久缓存或带宽预测。这些适合作为下一版优化；v1 不称为完整 Potree/COPC 替代品。

## 生成与接入

转换脚本需要 Python 3 与 NumPy；通用输入模式还需要 Node.js ≥ 22.12，复用网页现有读取器。本版集合打包入口读取现有 `index.json` 的 `buildings`、XYZ `point_cloud` 及 OBJ `mesh` 元数据。单个点云可直接调用脚本中的 `pack_cloud(points, output)`；完整 CLI 后续可扩展到任意格式。

```sh
python3 scripts/pack-bwvpc.py \
  --source /path/to/source-buildings \
  --output /path/to/new-output-directory \
  --base-url https://data.example/bwvpc/ \
  --original-base-url https://data.example/originals/
```

任意单文件或目录批处理（不要求建筑编号和 Mesh）：

```sh
# PLY 只转换 vertex 点记录；不是网格转换工具。
python3 scripts/pack-bwvpc.py --input /data/example.ply --output /data/example-tree \
  --root-points 8000 --node-points 8000

# 递归处理支持的文件，保留相对目录；每份输入分别生成一棵树。
python3 scripts/pack-bwvpc.py --input /data/clouds --output /data/cloud-trees
```

支持 XYZ/TXT/CSV/PTS、ASCII 与大小端 binary PLY、ASCII/binary PCD。LAS/LAZ 和 compressed PCD 尚未支持。单文件最多 512 MiB；当前转换在内存中采样，不是超大城市级点云的外存转换器。默认完整读取，不能通过隐式采样减少原始点数。

BWVPC v1 仍仅编码 XYZ。若输入还有 RGB、强度或其他点字段，默认报错；只有显式添加 `--xyz-only` 才允许舍弃，并在报告中记录舍弃的字段。原始文件始终保留。将来完整属性存储需要扩展格式，不能把 XYZ 转换宣称为全属性无损。

通用输入输出 `<原文件名>.bwvpc/cloud.bwvpc.json`、节点文件以及 `packing-report.json`（点数、节点数、单块大小、深度、源哈希、坐标误差、属性舍弃记录）。该报告是转换清单，**不是网页在线数据目录**；当前网页仍通过带 Mesh 的 BWVPC-COMPARISON 目录接入，单独树文件尚未接入全部本地点云工具。通用模式不上传、不生成虚假 Mesh、不自动修改展示链接。

输出目录必须不存在。脚本不改原始文件、不上传、不保存密钥；检查源哈希和每一行的唯一归属，并将审计文件写到输出目录旁边。上传到允许匿名 HTTPS GET 与 CORS 的对象存储后，保留目录结构。在线双视窗的集合目录使用 `schemaVersion: 3`、`format: "BWVPC-COMPARISON"`、`buildings: [{id, pointCloud: {url,bytes,sha256}, mesh: {url,bytes,sha256}}]`，其中 pointCloud 的 URL 指向该建筑的 `cloud.bwvpc.json`。

通过 `lod.html#compare=...` 配置链接可直接指定这个集合目录；内置集合的简短入口为 `lod.html?dataset=bwv-test4000&building=1`。旧的 `compare.html` 链接仅负责跳转到同目录的 `lod.html`，原样保留配置、建筑 ID 和语言。普通 XYZ/PLY/PCD 单文件预览仍走原来的加载器。本版没有将树索引接入全部本地编辑工具。

验证命令：

```sh
python3 tests/test_bwvpc_packer.py
node --test tests/bwvpc.test.mjs tests/online-compare*.test.mjs
npm test
npm run build
npm run test:artifacts
npm run package
```
