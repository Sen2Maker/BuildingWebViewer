# 共享相机导航 / Shared camera navigation

高斯、LOD、线框、点云和点云生成预览使用同一组控制器。修改导航行为时修改共享源文件，随后运行 `python3 build.py` 和 `python3 scripts/check.py`；不要直接修改 bundle。

## 使用约定

- 相机面板包含“第一人称漫游”和“环绕浏览手感”。设置保存在浏览器，各查看器下次打开时读取同一套偏好。
- 漫游：WASD / 方向键移动，空格上升，Shift 下降，Q 逆时针 / E 顺时针滚转相机；Ctrl 精细移动，Esc 退出。相机滚转时，画面向相反方向转。移动、鼠标灵敏度、滚转速度分别可调。
- 手机：左摇杆移动，右侧拖动转头，升降及 ↶ / ↷ 可多指同时操作。小屏漫游占满查看区域。鼠标锁定被浏览器拒绝时，桌面回退到按住拖动转头。
- 自动旋转中心在每次手势开始时估计一次，避免拖动中跳点；也可以锁定观察点或围绕模型中心。双击数据可锁定点击处，双击空白不改变焦点。平移之后可重新锁定。
- 普通查看器进入漫游时转换为等构图的透视镜头；退出保留机位。适应窗口恢复正交浏览。LOD 漫游所在场景仍是展示排列，不是建筑原始地理布局。

## 模块职责

| 源文件（src/shared） | 职责 |
| --- | --- |
| camera-geometry.js | 相机基向量、训练镜头及 CPU 投影 |
| camera-navigation.js | 输入速度、自适应尺度、时间平滑、偏好校验 |
| orbit-camera.js | 画面坐标旋转、焦点切换、保持构图 |
| fly-camera.js | 无 DOM 的第一人称位姿、移动及滚转 |
| fly-controls.js | 键鼠/触控、状态提示、失焦退出、销毁 |
| camera-navigation-controls.js | 中英文导航参数面板 |
| navigation-adapter.js | MeshViewer / CloudViewer 接口适配及深度拾取 |
| viewer-layout.js | 一次性挂载共享界面，连接多个对比视图 |
| camera-controls.js | 正交 v1 / 扩展 v2 书签校验和保存 |

新增查看器应提供 canvas、camera、target、origin、bounds、basis、render 与数据数量。普通渲染器调用 installCameraNavigation，并将输入交给 navigatePixels / navigationZoom，渲染循环调用 stepNavigation，销毁时释放控制器及监听器。具有自定义镜头的高斯渲染器直接复用共享控制器和投影数学，不重复维护按键与触摸逻辑。

## 精度与性能边界

LOD 通过三角面射线求交，线框通过投影线段拾取。点云在投影点中估计，最多约 20 万个候选采样；高斯从附近中心深度估计，排除隐藏、删除及低透明度点。这不是高斯透明表面的精确拾取。自动模式未命中时沿用已有观察距离，手动未命中不改焦点。大场景拾取只在手势起点发生，不在每帧重复。

书签 v2 保存透视和滚转，仍读取旧 v1；LOD 保留布局一致性校验。透视下没有全画面统一的真实比例尺。导出复用当前相机；跨近裁剪面的 SVG 线段目前可能省略，栅格截图不受此限制。

## 验证

检查覆盖相机重参数化不跳图、训练 fx/fy 保留、Q/E 对称与屏幕方向、投影矩阵、面/线深度拾取、书签兼容、输入生命周期及触屏取消。桌面浏览器页面和窄屏布局做本地验证；不能代替 Android 真机触控与原生鼠标锁定体验。

Shared controllers own input, preferences and lifecycle; renderers supply geometry and rendering. View-center depth for point clouds and Gaussian splats is approximate. Native editor integration uses the shared workspace lifecycle.
