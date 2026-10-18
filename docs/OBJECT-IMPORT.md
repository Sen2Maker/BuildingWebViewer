# Mesh / Wireframe · ID 数据组织

两种方式可以混合导入，支持文件、文件夹、拖放与 ZIP：

```text
dataset/
  100.obj
  100.xyz          # Wireframe 可配对读取；Mesh 只读 OBJ
  101/
    raw.obj
    refined.obj
    pc.xyz
  102/
    raw.obj
    refined.obj
```

- `100.obj` 作为 ID 100；`101/` 中的模型作为 ID 101 的不同 OBJ 版本。数字 ID 父目录优先，保留前导零。
- 一个 ID 文件夹中的对象文件直接放在该文件夹下；深层普通目录按对象目录识别。平铺数字 ID 文件可放在中间分组目录内。单独选择 `101/` 也可以。
- 同一目录下 `100.obj` 与 `100.xyz` / `100.ply` 等点云按完整文件名主干配对；不同来源目录的同名 ID 不覆盖，以后缀区分。原始文件不重命名、不移动。
- Mesh 默认多个 ID 独立陈列；可切为单个 ID。Wireframe 多 ID 按原始坐标叠加，保留原有坐标语义。
- 显示模式位于预览标题区，项目栏专用于文件管理；说明点击问号查看。OBJ 版本只在所选 ID 有多个版本时出现。
- 单 ID 使用上一个 / 下一个按钮或 ← / →、[ / ]；自然编号排序，遵循搜索筛选，输入框和漫游不抢键。
- Mesh 的 OBJ 版本按文件名沿用到下一 ID；找不到同名文件时回退可用版本。更换版本会使对应解析缓存失效。多 ID 时同一偏好应用到各个对象。

App 恢复旧项目时按真实源文件迁移 ID 和虚拟树状态；旧 Mesh 单文件条目合并后，已移除版本保留排除记录。此版本未修改原生 API。网页会话重新打开后仍需选择本地源文件。

Both viewers support flat ID-named OBJ files and OBJ variants inside ID folders. Mesh keeps independent model arrangements; Wireframe keeps original-coordinate overlays. Shared selection helpers preserve filename variants and filtered, natural ID navigation. Local files are unchanged.
