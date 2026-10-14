# 线框查看 / Wireframe viewing

左侧选择 **单个 ID** 或 **多个 ID 叠加**。一个 ID 对应一个源目录，其中可有多个 OBJ 版本与可选点云；Ctrl / Shift 的管理多选与显示勾选独立。

- 单 ID：勾选新 ID 直接切换并适应其范围；使用上一项 / 下一项按钮或 `←` / `→`、`[` / `]`，按自然编号顺序浏览当前搜索结果。输入框、下拉框、按钮和漫游操作保留原按键行为。
- 多 ID：勾选多个对象，按源坐标叠加；全选、反选和文件夹勾选遵循搜索范围，保留范围外的显示勾选。切回单 ID 保留最近激活的已选对象。
- 显示设置按文件名匹配各 ID 的线框与点云。缺少同名文件时回退到可用文件；主动选择“不加载”会沿用。设置存于当前浏览器网址，刷新后重选文件仍可恢复偏好。App 随项目保存选择及设置。
- 多 ID 的下拉框列出已选对象所有文件名；并排比较最多三个版本，各面板内叠加对应 ID。单个对象缺少额外版本时，不重复绘制已用文件。

叠加不改变源坐标，也不自动配准；相距很远的数据在整体适应后会显得很小。解析缓存用于已载入文件，容量仍取决于设备。

Choose **Single ID** or **Multiple IDs** in the sidebar. Each ID is a source folder containing OBJ variants and optional clouds. Single-ID navigation fits new data and follows naturally sorted search results. Multi-ID All/Invert and folder checks affect search matches while retaining other selections. Filename preferences persist locally, fall back when unavailable, and preserve deliberate None choices. Comparison panes overlay each selected ID’s corresponding variant without changing coordinates. Input editing and fly controls keep their normal keys.
