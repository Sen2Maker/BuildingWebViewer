# 点云创作与修订 / Point Cloud Studio

v1.4.0，入口 `generate.html`。工作台有三个模式：浏览、绘制点云、选择与修订。左侧只管理对象和文件；右侧按模式显示工具和当前对象属性。

## 从绘制到修订

1. 从空白绘制，或导入 TXT / XYZ / CSV / PTS / PLY / PCD。可同时导入多个文件，也可拖入文件。
2. 绘制时选择 XY / XZ / YZ / 当前视角工作平面，设置深度与吸附；“正对平面”便于落点。折线逐点点击，自由画笔按住拖动；面和拉伸体使用闭合轮廓。支持简单凹多边形，不支持洞、自交或非共面的底面。
3. 设置生成间距与颜色后完成绘制。Enter 完成、Backspace 退回一点、Esc 取消；触屏有对应按钮。浏览模式用于调整相机。
4. 切换“选择与修订”，使用矩形或自由套索。可替换、追加、减选，全选或反选；作用于当前对象或全部显示对象，也可限制 Z 高度。
5. 选中点显示粉色，可删除、只保留选区、提取成新对象或染色。删除是可恢复的；撤销 / 重做支持 Ctrl+Z / Ctrl+Shift+Z，Delete 删除选中。对象属性内可恢复删除点。

**选择是穿透的**：框内前后各层都会选中，并包含预览抽稀时未显示的源点。先检查视角或限制高度再删除。这里尚未实现只选最前表面的深度选择。

## 保存和输出

- 自动保存已完成对象至当前浏览器、当前站点的 IndexedDB，刷新恢复；未保存完成时离页有提示。未完成笔画和撤销历史不持久化。清理浏览器、换端口或隐私模式可能使本地保存不可用。
- “保存项目”输出 `.bwvproject`：完整 XYZ、原有属性、颜色、删除掩码和绘制配方。可重新打开继续修订；旧版 JSON 绘制配方仍可读入。重要工作请保存项目文件。
- PLY 导出和“在点云查看器中打开”使用可见对象的全部保留点，不使用预览抽稀数据。删除后仍按原始点索引保留强度、法向量等属性；染色新增编辑颜色字段，保留原字段数值。
- 绘制对象可以编辑原始顶点、间距及拉伸参数，但重新采样始终生成新副本，避免覆盖已有点级修订。

## 模块边界

| 模块 | 职责 |
| --- | --- |
| `drawing-geometry.js` / `sample.js` | 工作平面、轮廓验证、三角化、线 / 面 / 体采样 |
| `drawing-controls.js` | 指针绘制、草稿和工作平面提示 |
| `point-edit-model.js` | 原始点、删除掩码、选区操作和共享缓冲的撤销历史 |
| `point-selection.js` / `selection-controls.js` | 分块投影选择、套索、交互及高亮 |
| `editor-project.js` | 二进制项目校验、读写与 IndexedDB 持久化 |
| `app.js` | 模式切换、对象列表、导入导出与共享查看器集成 |

模板入口已移除；旧形体采样代码仅保留用于读取旧项目。渲染、相机、截图和文件解析复用已有模块。不直接编辑 bundle；修改后运行 `python3 build.py` 和 `python3 scripts/check.py`。

## 当前边界

预览每对象最多约 12 万点，选区按完整点云计算。绘制单次采样最多 200 万点；项目最多 200 对象、512 MB 点缓冲，旧 JSON 输入最多 4 MB；PLY 输出有 512 MB 保护。撤销最多 20 步，并按共享缓冲内存裁减旧历史。

鼠标射线与明确的工作平面求交得到 XYZ，尚无贴合已有点云表面的画笔、自由曲面、孔洞、布尔运算或体素雕刻。采样边界可能有重合点；线与体积内点没有唯一法向。小屏浏览器检查不代表 Android 真机验证。

Draw or import point clouds, then select, crop, extract or paint points. Full source coordinates and attributes survive edits and portable project roundtrips. Selection works through depth on the full cloud; the rendering preview may be thinned. Everything stays local.

Android 使用项目私有存储的快照，不使用网页版全局 IndexedDB；通过系统分享导出同一 `.bwvproject`，可在电脑与手机网页继续编辑。App 后台保存只保证已完成的操作，未完成笔画不持久化。
