# 点云处理 / Point-cloud processing

在点云查看器勾选一个或多个文件，打开 **处理**。所有计算与保存都在本机完成；离线页面和 GitHub Pages 均可使用。

Select clouds in the point-cloud viewer and open **处理 (Processing)**. Computation and export run locally, including on the offline page and GitHub Pages.

## 计算 / Compute

- **全部点 / All points**：按需重新读取原文件，不受显示上限影响。**当前显示点 / Displayed points**：只处理当前显示样本。对于计算结果，“全部点”指该结果自身的全部点，不会补算它未包含的原始点。
- 每个文件独立建立 KD-tree，在最多 k 个近邻（包含自身）上拟合 PCA 平面；可同时限制最大半径，0 表示不限。半径和粗糙度单位与输入坐标一致。选中多个文件不会跨文件寻找邻居。
- 默认 k=32、方向 +Z。大邻域通常更平滑，也更容易混合屋脊两侧；请按数据密度调整。坐标轴定向不保证闭合表面朝外，也不执行连通传播。方向分量接近 0 时按第一个非零分量确定符号。
- 计算在 Web Worker 中运行，支持进度和取消。结果作为独立条目出现，自动选中并按坡度着色。原始属性同名时，新字段使用 `_2` 等后缀。

All-point processing rereads originals when necessary; displayed-point processing uses only the current sample. Each cloud is processed independently with a KD-tree and PCA plane fit. k includes the query point; an optional radius further restricts the neighborhood. Axis orientation does not guarantee outward normals. Results are separate entries, with existing attributes preserved. For a derived cloud, “all points” means all points in that result, not the missing original points.

| 字段 / Field | 定义 / Definition |
| --- | --- |
| `nx`, `ny`, `nz` | 单位法向量 / Unit normal |
| `slope` | 与水平面的夹角，0–90° / `acos(abs(nz))` in degrees |
| `planarity` | 平面度 / `(λ₂ − λ₁) / λ₃`, with `λ₁ ≤ λ₂ ≤ λ₃` |
| `roughness` | 该点到邻域拟合平面的绝对距离，不是邻域 RMS / Absolute query-point distance to the fitted plane, not neighborhood RMS |
| `normal_valid` | 1 有效；0 邻域不足或近似共线，此时特征为 NaN / 1 valid; 0 insufficient or near-collinear neighborhood, with NaN features |

## 保存与合并 / Save and merge

选择范围、格式与保存方式，点击 **导出所选 / 合并为一个文件**。单选保存单个点云，多选按原始 XYZ 拼接；不配准、不去重、不转换坐标系。建议使用二进制 PLY；TXT 带数值字段表头，便于脚本读取。

The export button saves one cloud or concatenates all selected clouds. It preserves original coordinates and does not register, deduplicate, or transform coordinate systems. Binary PLY is recommended; TXT includes a named column header.

- XYZ 与数值属性使用双精度保存，属性取并集，缺失值为 NaN；并非所有第三方 TXT 工具都接受 NaN。
- 可附加 `source_id`；从 0 开始的编号、源文件名、计算参数及字段改名映射写在文件注释中。字段名会规范为 ASCII；已有同名属性不会被覆盖。
- 有 RGB 的源使用标准 RGB 输出，无 RGB 的源填黑色并标记 `rgb_valid=0`；原始颜色属性另存为 `original_*`。保存的是数据颜色，不是屏幕上的色带渲染颜色。
- 计算结果暂存在内存，刷新即清除；请导出文件留存。“移除所选计算结果”释放不再需要的结果引用。

Coordinates and scalar attributes are written as doubles; missing attributes use NaN. Source IDs, names, processing parameters and renamed-field mappings appear in comments. RGB is standardized for mixed sources, missing colors are black with `rgb_valid=0`, and original color attributes remain under `original_*`. Export saves data attributes, not the current screen palette. Results are held in memory until export and are lost on refresh.

## 大数据 / Large data

浏览器仍需容纳解析后的输入、邻域索引和计算结果；这不是磁盘外存算法。大文件建议先用显示样本验证参数。后台计算可保持界面响应，但不承诺任意规模的数据都能在浏览器中处理。

导出逐块序列化，不创建合并坐标数组。支持直接保存的 Chrome / Edge（HTTPS 或 localhost）逐块写入文件；其他环境使用下载缓冲，限制为 256 MiB（TXT 按保守大小预估）。取消会放弃未完成的写入；取消保存选择器可能留下浏览器创建的空文件。

Processing still requires parsed inputs, an index and output arrays in memory; it is not an out-of-core algorithm. Try a displayed sample first for large datasets. Export serializes chunks without a merged coordinate array. Supported Chrome / Edge HTTPS or localhost sessions write directly to disk; other environments use a download buffer limited to 256 MiB, with a conservative TXT estimate. Cancelled writes are discarded; cancelling a picker may leave an empty file created by the browser.

算法参考：[CloudCompare 法向量计算](https://cloudcompare.org/doc/wiki/index.php?title=Normals%5CCompute)。本工具实现的是上述基础 PCA 功能，不包含 CC 的全部拟合与定向算法。
