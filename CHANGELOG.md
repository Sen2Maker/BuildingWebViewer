# 更新日志 / Changelog

每次对外发布都使用独立版本；已发布的标签和程序包保持不变。Every public release has a unique, immutable version.

## [Unreleased]

- 修正 ZIP 校验器的 Android 30 API 兼容性，不提高最低系统版本；CI 独立汇报 lint 与单元测试结果，检查失败仍保持失败。
- Preserve API 30 ZIP-buffer compatibility and report lint/unit outcomes independently without suppressing failures.

- 修正原生高斯 Activity 的资源会话变量遮蔽错误，并复用已验证的资源快照；继续原生编译验证，不发布安装包。
- Fix native Gaussian Activity runtime-variable shadowing and reuse the validated resource snapshot; native compilation remains under verification, without APK publication.

- 原生编译 CI 按 AGP 8.13.0 源码审核导航资源、类 JAR 和仅供 lint 使用的库 AAR 中间任务；仅接受已观察的 121 个精确任务路径，新增任务绑定实现类与输出检查，继续禁止 APK/AAB、签名、安装、发布及 SDK/JDK 自动下载。Android 编译结果仍待实际运行。
- Audit AGP 8.13.0 navigation, class-JAR and local lint-AAR intermediates against pinned sources. Accept only the observed 121 task paths, with added class/output checks; APK/AAB, signing, installation, publication and SDK/JDK auto-download remain forbidden. Actual Android compilation is still pending.

- 修正原生检查工作流的运行器临时目录配置；缓存路径在任务启动后设置，保留只读、无 APK 的验证范围。
- Fix native CI runtime-cache initialization after runner startup; retain the read-only, no-APK validation scope.

- 新增隔离的原生 C1 编译检查快照与只读 CI：仅使用合成网页资源检查 Java 编译、Android lint 和本地单元测试，不新增 CAD 引擎资源、不改许可证，也不签名、打包 APK 或部署。当前为未发布检查点，根应用版本不变，托管 Android 检查及真机验证尚未执行。
- Add an isolated native C1 compile checkpoint and read-only CI with synthetic web assets only. No new CAD engine payload, license change, signing, APK packaging or deployment. This is unreleased; the root application version is unchanged, and hosted Android/device validation remains pending.

## [1.10.0] - 2026-10-18

- 本地验证：148 项网页回归、5 个工具导航测试、23 个 Android 脚本兼容检查和 Android Debug 编译 / 单元测试通过；已核对中英文、390 像素布局及三栏 PNG 导出。未进行真机触摸与大数据压力测试。

- Mesh 支持按 ID 配对点云，提供高度、RGB、数值字段着色、点大小、透明度与点样式；网格和点云共用排列变换与深度遮挡，默认读取全部点。
- Mesh 增加双 / 三视窗版本对比、独立图层选择和相机同步开关；图片支持导出全部视窗，相机动画仍使用第一视窗。
- 五个网页工具统一「数据、显示、相机、书签」入口与设置顺序，专属处理 / 编辑 / 诊断收进工具菜单；线框使用同一套单 / 双 / 三视窗入口，手机对比区可横向滑动。
- Android 原生高斯将显示设置移到主工具栏；网页 App 工具复用同一套界面与 Mesh 点云 / 对比功能。原生高斯 UI 更改需新 APK。
- Add ID-paired point overlays and two/three-pane Mesh comparison with shared transforms, independent layer visibility, synchronized cameras and multi-pane image export. All five web tools share inspector navigation; Wireframe shares the layout selector. Android Gaussian exposes Display on its native toolbar.

## [1.9.0] - 2026-10-18

- Mesh 与线框的显示模式、ID 切换和版本选择统一移至预览标题区；多 ID 隐藏逐项切换，仅有多个版本时显示 OBJ 选择，说明按需展开，项目栏留给文件列表。
- Move Mesh/Wireframe viewing controls beside the preview; show ID navigation and OBJ variants only when relevant, with help on demand.

- Mesh 与线框共用 ID 导入规则，支持 ID.obj 与 ID 文件夹、同名点云配对和混合导入；独立路径同名 ID 不覆盖。
- Mesh 增加单个 / 多个 ID、筛选内上一个 / 下一个与快捷键，以及按文件名沿用的 OBJ 版本选择；切换版本更新缓存，切换单 ID 适应新模型。
- 旧 App 项目按实际源文件迁移选择、虚拟分组、重命名与移除记录，原始文件不修改。
- Share ID-file / ID-folder imports across Mesh and Wireframe. Add single/multiple Mesh IDs, filtered navigation, shared shortcuts and filename-based OBJ variants; migrate legacy native project metadata by source identity.

- 验证：143 项网页测试、WebView 60 兼容及 23 个 Android 脚本检查通过；桌面与 390 像素宽布局、混合 ID 导入、版本沿用和批量选择已验证。未进行真机触屏与大场景压力测试。
- Validation: 143 web tests, WebView 60 compatibility and 23 Android script checks pass. Desktop/narrow layouts and synthetic mixed-ID workflows verified; physical touch and large-scene performance remain untested.

## [1.8.2] - 2026-10-16

- 整批进度采用圆角平行四边形：浅蓝进度色块、深蓝百分比标签、淡蓝白条纹；数字端正，百分比标签不会越过两端，保留无障碍进度语义。
- Style shared batch progress with rounded slanted shapes, a light-blue fill, dark-blue percentage badge and pale blue/white stripes; retain accessible progress semantics.

- 批量加载按整批对象 / 模型 / 文件数量显示进度，完成一个才计数，不再逐文件重置；显示失败数量与准备画面阶段，快速换选时旧任务不覆盖新进度。
- Show item-count progress for the whole batch across viewers, with failed-item counts and scene preparation; superseded loads cannot overwrite current progress.

- 限制线框多 ID 文件说明、对比标题与高斯多文件标题长度，避免挤满画面；统一长名称、标签栏和手机布局边界，完整列表仍在项目栏。
- Bound multi-file scene labels and Gaussian titles; constrain long chips and annotations across viewers and mobile layouts. Full source lists remain in the project tree.

- 验证 / Validation：138 项网页测试、28 项原生单元测试、WebView 60 兼容编译和完整 APK 构建通过。进度按对象数量统计，不代表耗时；原生高斯加载界面保持现有实现。

## [1.8.1] - 2026-10-16

- 统一跨工具显示偏好、配色、相机、书签、投影切换和文件下载 / App 分享；高斯工具保留专用镜头控件，并兼容迁移旧书签。
- 修复触屏项目树框选抢滚动、重绘丢失键盘焦点、销毁后文件夹仍导入、切换投影跳动，以及后台自动保存失败和异步快照状态不一致的问题。
- 分别记住电脑与手机项目栏折叠状态；改善触屏控件、原生高斯显示设置提交和横屏漫游控件排布。
- Unify portable display preferences, camera/bookmark controls, projection and file saving. Retain calibrated Gaussian lenses and migrate legacy bookmarks. Fix project-tree interactions, background save retries and snapshot consistency; improve mobile controls and native landscape layout.
- 验证：134 项网页测试、28 项原生单元测试、移动兼容检查与完整 APK 构建通过；真机触屏手感和强杀恢复仍需实测。详见 `docs/validation/MODULE-AUDIT-2026-10-15.md`。

## [1.8.0] - 2026-10-15

- 桌面网格工具新增相机动画时间轴：设置时长与帧率、捕获和移动关键帧、选择过渡、环绕示例、播放预览与撤销重做。
- 时间轴和输出设置自动保存在浏览器，支持 JSON 备份；逐帧导出 MP4 / H.264、WebM / VP8 或 PNG 序列 ZIP，支持取消并恢复相机。
- 通用动画数据、界面与导出模块独立于网格适配器；精简模式、可调整面板和固定标题减少界面拥挤。
- Desktop Mesh Viewer adds a camera animation timeline with keyframes, transitions, playback, browser persistence and JSON backups. Export exact-frame MP4, WebM or PNG sequences; cancel safely and restore the camera. Shared modules provide a boundary for future viewer integration.
- 验证 / Validation: web regressions, actual MP4 / WebM packet counts and timestamps, PNG ZIP CRCs/dimensions, cancellation and Android unit tests. Native API 12 remains compatible; includes a matching complete APK and signed web update.
- 范围 / Scope: desktop Mesh Viewer only. Mobile web and App do not enable the timeline yet. Encoding support depends on the browser; PNG sequence is the fallback. Large-scene long-video stress testing and direct-to-disk end-to-end testing remain pending.

## [1.7.2] - 2026-10-14

- 点云创作中“调整视角”允许暂停画笔并保留草稿；“继续绘制”恢复原工具与工作平面，修复存在草稿时无法切换浏览的问题。
- Esc 改为暂停绘制；完成生成和丢弃草稿后返回视角操作，退出画笔时释放指针捕获，防止继续落点。
- 绘制工具与草稿操作分组，参数按需打开；精简手机按钮排布，并同步画布与操作提示。
- Pause drawing to adjust the view while retaining the draft, then resume with the same tool and work plane. Escape pauses; generation and discard return to navigation. Release pointer capture when stopping drawing and streamline desktop/mobile tools and contextual hints.
- 验证 / Validation: interaction regression tests, full web checks and Android unit tests; native API 12 remains compatible.

## [1.7.1] - 2026-10-14

- Release 标题统一为 BWV v版本号，精简公开说明。
- 包含单个 / 多个线框 ID、批量勾选、线框版本偏好和快捷导航；保持 nativeApi 12 兼容。
- Use concise BWV release titles and streamlined public notes. Includes wireframe ID overlays, remembered variants and previous/next navigation with native API 12 compatibility.

## [1.7.0] - 2026-10-14

- 线框查看新增单个 ID / 多个 ID 模式；多选按原始坐标叠加，支持全选、反选、文件夹勾选和移除，批量选择遵循搜索结果并保留筛选外勾选。
- 切换 ID 自动适应新对象范围，修复保留旧观察中心导致画面空白；快速切换取消旧任务，复用文件解析缓存。
- 线框版本和点云选择按文件名沿用，缺少同名文件时回退可用文件；主动选择“不加载”仍保留。显示偏好存于本地浏览器，可继续逐 ID 并排比较。
- 单 ID 增加上一个 / 下一个按钮与 ← / →、[ / ] 快捷键，按自然编号顺序，遵循搜索筛选；输入控件和漫游操作不抢键。
- Add single/multiple wireframe ID modes with overlays, scoped All/Invert and folder selection. Fit new IDs, retain filename-based variant preferences, reuse parsing caches and support previous/next shortcuts without stealing editing or fly controls.
- 完善双语文档及界面示例；原生接口保持兼容，每版提供完整 APK 和签名热更新。

## [1.6.5] - 2026-10-14

- 完善相对高度、面朝向配色、全量高斯与 App / 网页保存及编辑边界说明；更新移动端文档。
- 修复本地服务器遗漏 GLSL MIME 类型导致启动失败；中英文 README 使用分别截取的真实界面图；完善项目简介。
- Improve tool guides and browser/native capability descriptions. Refresh bilingual guides and separate real UI screenshots.

## [1.6.4] - 2026-10-14

- 恢复右侧视角摇杆：绕当前相机局部轴左右转头、上下抬头低头；独立左倾／右倾按钮只改变倾斜，不改变视线与位置。保留移动摇杆和升降控制。
- 修复接近俯视时世界角度转动表现为倾斜的问题；普通旋转和漫游拖动均采用相机局部轴。相机书签增加可选倾斜角，旧文件默认零倾斜。
- 默认触摸灵敏度从 0.3 提至 1.0，视角摇杆满幅转速从 65 提至 110°/s，平滑时间从 100 降至 45ms。灵敏度与摇杆转速独立保存；旧默认值自动升级，已有自定义值保留。
- Restore a camera-local look stick and separate lean buttons. Improve default response and preserve sensitivity, look speed and camera roll. Keep automatic view-center pivots and all splats; native fixes require the complete APK.

## [1.6.3] - 2026-10-14

- 原生漫游采用当前相机坐标：前后沿视线，升降沿画面上方向，左右沿画面右方向，不再把世界 Z 固定作为升降。旧书签坐标保留。
- 用四个按住按钮代替视角摇杆，移动、升降和视角输入独立，松开／取消停止对应动作。
- 恢复默认“当前视野中心（自动）”旋转中心：退出漫游和开始旋转时，从画面中心附近的完整高斯估计深度；无命中时保留现有距离。重新设定中心时保持相机位置和镜头，避免画面跳动。
- 恢复缩放自适应旋转／平移与时间平滑，可选择固定或模型中心；设置随项目保存。保留全部高斯，原生修复需覆盖安装完整 APK。
- Use camera-relative free flight and explicit look buttons. Restore automatic view-center pivots, adaptive gesture scale and elapsed-time smoothing. Anchor depth is an estimate, not an exact surface raycast; no source splats are removed.

## [1.6.2] - 2026-10-14

- 修复原生相机数字输入框被主题内边距裁切，改为自适应高度、紧凑对齐布局和完整宽度滑块；完成按钮提交当前输入。
- 漫游中缩放改为光学放大，保持相机位置；兼容旧书签默认倍率。
- Android 模拟器用真实摇杆事件与渲染截图验证右移、右转、抬头的画面方向，保留全量高斯渲染。原生修复需覆盖安装 APK。
- Fix clipped native camera fields and commit focused edits on Done. Fly zoom adjusts optical magnification without moving the eye; old views default to 1×. Verify rendered move/look directions on Android.


## [1.6.1] - 2026-10-14

- 修正漫游坐标：前后左右沿水平面移动，不再随俯仰升降；高度使用独立世界 Z 轴。
- 左侧移动摇杆、中间升降键、右侧视角摇杆分别处理平移、高度与旋转，松开／取消触摸立即停止；多控件输入互不清空。
- 控制器叠放在画面底部，不再挤压渲染视口；收紧工具栏、去除按钮阴影，并提供明确标签与按下反馈。保留截图、相机、项目书签与全部高斯。
- Fix planar fly navigation and separate height/look controls. Add native thumb pads with independent multitouch input and compact overlay styling. Native code changed; install the full APK.

## [1.6.0] - 2026-10-13

- App 项目高斯工具直接进入原生全量查看器；移除手动原生开关、兼容画面和高斯编辑入口，沿用浅色圆角与紧凑工具栏风格。网页保留原查看器，手机网页增加 App 推荐提示。
- 新增原生漫游、按住移动、相机滑块与数值微调；视角保存在项目中，书签支持 JSON 导入导出。保留截图、透视／正交、多文件与可折叠文件分组。
- 缓存属性字段，复用协方差工作区与批量球谐缓冲；相机范围改为精确选择，减少解析开销。弱引用复用已解析数据；分阶段进度和首次渲染预热避免把启动开销留到首次触摸。
- 原生诊断新增排序应用数、旋转范围、画质、解析／上传／预热信息；渲染回调间隔不等于实际呈现 FPS。保留全部高斯；更新原生接口需要覆盖安装 APK。
- Open Gaussian projects directly in the native viewer. Add fly movement, camera sliders/numbers, persistent project views and JSON export/import. Optimize full attribute packing and startup warmup; clarify staged progress and native diagnostics. No sampling. Full APK required.

## [1.5.0] - 2026-10-13

- Android 新增独立的原生高斯只读查看器：直接读取本机项目，使用 GLES 3 与独立 GL 线程渲染全部高斯，原生触摸旋转、平移和缩放。
- 支持高画质 PNG 截图、自动／手动 10 秒原生诊断。保留 App 内兼容查看，旧编辑记录仍由兼容模式处理；原生模式显示原始完整数据。
- 原生着色器与网页着色器由同一源码生成，后续可信热更新可更新着色器。本版本新增原生接口，需要安装完整 APK；不改变网页版。
- Add a native Android read-only Gaussian viewer with full local data, GLES 3 rendering, native camera gestures, PNG capture and diagnostics. Keep the in-App compatibility viewer for previous edits. This version requires a complete APK; real-device performance needs comparison.

## [1.4.7] - 2026-10-13

- 优化默认高斯绘制：固定纹理地址使用位运算、低阶颜色跳过高阶计算、提前保守屏幕外剔除，并缩小原本已低于透明度阈值的外围绘制区域。保留全部数据、可见椭圆形状和精确深度排序。
- 额外提供投影复用对照开关，默认关闭；不同 GPU 收益不同，缓冲预算或初始化失败时回退到直接绘制。
- 仅剔除整个投影四边形都在屏幕外的高斯；保留边缘重叠的大高斯。编辑标记纹理由 RGBA32F 改为 R8，片元颜色去掉冗余除法。
- 新增自动旋转 10 秒诊断并恢复原视角；诊断区分事件送达、动画回调等待、实际绘制路径与额外投影缓冲开销。
- Optimize direct full-resolution drawing, skip invisible support and offscreen quads, compact edit flags, and avoid redundant shader work. Projection reuse is an optional experiment, off by default. Add reversible automatic orbit diagnostics and scheduler timings; phone gains require comparison.

## [1.4.6] - 2026-10-13

- 高斯相机尺寸通过 ResizeObserver 缓存，减少逐帧布局读取；相机面板按变化节流更新，运动画质延迟恢复以减少画布尺寸来回切换。
- 精确深度排序从四轮改为三轮，保留全部 32 位排序键、全部高斯和稳定排序；新增输入延迟、画布切换次数和分阶段 CPU 诊断。
- 各查看器加载提示支持长文件名换行及独立活动进度条；高斯解析显示真实百分比进度。未知总量时不显示虚假百分比。
- Cache Gaussian viewport dimensions, throttle camera UI, stabilize motion quality, retain exact sorting with three radix passes, add phase diagnostics and clearer loading progress.

## [1.4.5] - 2026-10-13

- App 在网页脚本启动前启用独立项目导航；启动中的首页按钮和旧 `index.html` 路径均返回 App 项目首页，网页版流程保持独立。
- 移除原生诊断中的“使用内置页面”按钮，避免清除热更新状态、退回旧 APK 的资源。保护启动生命周期事件，保留高斯/创作页面的脱敏诊断路径和最近脚本警告。
- 诊断日志改为后台合并写入；高斯排序结果采用可回收传输缓冲区，减少大数组分配，保留完整数据与排序规则。
- 每个版本都构建同版本完整 APK 和签名热更新包，不再复用旧 APK。原生层修复需要覆盖安装本版 APK，项目数据保留；热更新仍用于兼容网页改动。
- Separate native App navigation and the browser hub; remove downgrade recovery, guard lifecycle events, improve local diagnostics and recycle Gaussian sort transfers. Every release includes a same-version full APK plus a signed web update. Install this APK for native fixes.

## [1.4.4] - 2026-10-11

- 高斯各画质档位保留全部数据；手机默认使用全量流畅画质，旧项目的数量限制不再影响显示。
- 新增独立像素倍率、交互降质开关和交互颜色阶数。移动时降低像素/球谐阶数，停止后恢复；切换画质不重新解析模型。截图导出保持所选完整颜色。
- 预计算静态协方差；每个高斯改用 4 顶点三角形带；球谐纹理按四系数读取，减少重复着色计算。后台排序返回后复用顺序数组与纹理存储。
- 不再为了截图永久保留高斯默认绘图缓冲区；快速截图在同一任务内重绘并复制，高级截图继续使用独立帧缓冲区。
- 诊断新增主线程整帧、排序纹理上传及连续交互绘图间隔，明确它们不是 GPU 耗时或屏幕呈现 FPS。首页入口改为“渲染诊断”。
- Retain all Gaussians in every quality preset; independently tune pixels and temporary motion SH quality, restoring after motion. Reuse sort uploads, precompute covariance, draw four-vertex strips and fetch packed SH bands. Extend opt-in timing diagnostics; preserve quick and advanced screenshots.
- nativeApi 6 不变，通过签名网页热更新分发，无需重装 APK。真实 Adreno 730 性能仍需用户复测；本地验证结果见 docs/validation/v1.4.4.md。

## [1.4.3] - 2026-10-11

- 修复共享依赖目录通过符号链接参与构建时，兼容脚本包含本机路径、导致热更新包无法与 CI 重建产物一致的问题；固定依赖路径表示，保留原有签名及字节校验。
- 包含 v1.4.2 的全部诊断功能。v1.4.2 的 App 更新清单被部署校验拦截，未通过 Pages 发布；本版递增序号重新发布，不覆盖历史附件。
- Fix reproducible compatibility bundles when dependencies are symlinked. Retains v1.4.2 diagnostics and all signature/hash checks. The v1.4.2 update was blocked by deployment verification; this patch supersedes it without replacing published artifacts.
- nativeApi 6 不变，继续复用 v1.4.0 APK，无需重新安装。

## [1.4.2] - 2026-10-11

- 高斯查看器新增“诊断”：实际 WebGL 渲染器与厂商、上下文状态、原始/提交高斯数量、显示模式和分辨率。
- 手动采集 10 秒，记录后台排序、排序往返、CPU 提交与可用时的 GPU 绘制耗时；缺失数据明确为空，不以 CPU 提交时间冒充 GPU 时间或 FPS。
- 报告可复制或导出；App 首页“诊断”显示最近报告，仍可进入原生启动诊断。报告仅保存在本机，不包含文件名、点坐标或项目内容。
- Gaussian GPU diagnostics, optional ten-second timing samples, copy/export and the latest report accessible from App home. Unknown renderer identity is never reported as confirmed software rendering.
- nativeApi 6 不变，通过签名网页热更新，无需重新安装。此诊断版保留 v1.4.1 显示策略；未验证的全量渲染优化与下降按钮修复不在本次发布范围。真实手机性能仍需用户报告确认。

## [1.4.1] - 2026-10-11

- App 自动保存改为有变更时每 5 分钟一次；系统返回、进入后台及显式导入前立即保存。共用调度器，停止每次转动相机后写入。
- 手机高斯默认分段抽样读取 2 万个、底色渲染，补偿抽样覆盖并限制屏幕像素倍率，操作中进一步降低分辨率；另提供 5 千个中心点低配预览。完整数据与编辑按需启用，源文件和完整编辑标记不受抽样影响。
- 可选视距限制与边界淡出，默认关闭以避免裁掉整个模型；仅影响显示，不改变源数据。
- 相机平移不再触发无意义重排；转动时继续显示，后台排序完成后修正透明层次；排序缓存复用。
- 高斯编辑与导出收进独立标签；App 首页精简说明，项目管理和维护收起，底部添加 Sen2Maker 与仓库链接。
- Five-minute dirty autosave with Back/background flush; bounded mobile Gaussian previews, responsive asynchronous sorting, an optional Edit tab, and a simpler project home.
- nativeApi 6 不变，可经签名网页热更新，无需重新安装 APK。完全不支持 WebGL 2 的设备仍不能渲染；预览抽样会减少细节，完整模式仍取决于设备性能。

## [1.4.0] - 2026-10-11

三维创作与跨端项目 / 3D creation and cross-platform projects. Android remains Preview.

- 新增三维高斯 PLY 查看与基础修订：透视 / 正交、球谐颜色、训练相机、框选 / 画刷、隐藏 / 删除及原始属性 PLY 导出。
- 新增点云创作与修订工作台：工作平面折线、自由画笔、面和拉伸体采样；现有点云导入、矩形 / 套索、删除 / 裁剪 / 提取 / 染色、撤销及完整项目保存。
- 相机导航共用模块：漫游 WASD、升降、Q/E 滚转，手机摇杆；视野 / 固定点 / 模型中心旋转、独立灵敏度、可选平滑。
- 电脑网页、手机网页和 Android 共用数据与编辑逻辑；`.bwvproject` 跨端保存源点、属性和删除状态，常规点云和高斯通过 PLY 转移。文件由用户分享或复制，不上传到服务器。
- App 为新工具新增原子项目快照、保存后返回、后台保存及原生分享导出；备份包含快照，旧项目继续可读。修复 Android 兼容构建依赖路径、二进制分段读取偏移，以及首页返回退到后台的行为。
- nativeApi 6：本次需要新版 APK；沿用签名验证、公告、离线启动与失败回退。后续兼容网页更新继续使用原有更新通道。
- Gaussian PLY viewing/editing, point-cloud drawing/refinement, shared fly/orbit navigation and portable point editor projects. Native snapshots, backup, Back and share/export integrate both new tools into Android projects.
- 边界：选区为穿透选择；高斯仍非 SuperSplat 全功能替代。无曲面吸附、孔洞或布尔雕刻；不跨设备自动同步。Android 为预览版，厂商设备手感与大数据内存需用户实测。

## [1.3.0] - 2026-10-10

签名更新与完整的 App 升级流程 / Signed updates and an integrated App upgrade flow. Android remains Preview.

- 原生验证 ECDSA P-256 / SHA-256 签名清单，内置公钥；校验版本序号、有效期、来源、大小、哈希和兼容性，拒绝无签名、被篡改及回放的网络更新。私钥不进入仓库、APK 或 CI。
- 网页修复更新自动准备，功能更新先确认；下一次启动生效。Android 底层更新先展示说明，经同意下载，验证包名、版本、哈希及与已安装 App 相同的证书，再交给 Android 系统确认安装。支持下载进度、取消、继续安装与安装来源授权入口。
- App 首页新增“版本与更新”：手动检查与本地版本公告。公告随包保存，实际启用版本后展示一次；下载、取消、失败及回退不会伪报更新完成。
- 下载文件区分为 Android APK、Web ZIP 与 App 专用 `.bwvupdate`。nativeApi 5，需要覆盖安装新版 APK；项目数据格式不变。
- 旧 v1.2.0 / v1.2.4 Release 在新版验证发布后转为草稿，停止公开分发旧 APK，保留 Git 标签与恢复能力。已安装的旧 App 不能远程撤回。
- Native ECDSA signature verification with pinned public keys, sequence/expiry checks and artifact hashes. Unsigned or tampered updates fail closed while local projects remain usable offline.
- Consent-based native APK downloads verify package/version/certificate before Android installation confirmation. Patch web updates stage automatically; feature updates ask first.
- Version controls, download progress/cancellation, and bundled release notes shown once after activation. Distinct APK, Web ZIP and `.bwvupdate` downloads.
- Native API 5 requires reinstalling the preview APK over the previous version. Existing data and preview signing identity are retained. Key rotation currently requires a trusted APK upgrade; this is not a complete TUF implementation.

## [1.2.4] - 2026-10-10

Android 返回导航修复；包含此前未正式发布的 1.2.1–1.2.3 修复。Android Preview 仍为测试版。

- Android 返回键/返回手势：查看器先处理已打开的设置或菜单，然后保存当前项目并返回 App 项目首页；首页再返回时交由系统退出/退到后台，不重放旧查看器历史。
- 页面首页按钮与系统返回共用保存流程；保留语言，合并连续返回操作，保存失败时留在当前页并显示保存错误。原生弹窗与文件选择器仍优先响应自身返回。
- 修复本地启动地址，保留原生诊断、WebView 60 兼容构建和不阻塞启动的后台检查。网页和项目都在本机；诊断报告仅手动导出。
- 本版需要覆盖安装 APK（nativeApi 4），项目格式和预览签名保持不变。Android 15 厂商手势仍需真机确认。
- Android system Back now returns from viewers to project home after saving. Home Back leaves the app rather than replaying old viewer history; open settings/menus and native dialogs close first.
- Shared save-aware navigation preserves language, coalesces repeated Back requests, and keeps the viewer open on save failure.
- Includes the unpublished local-startup, offline compatibility and native diagnostic fixes. Native API 4 requires the new preview APK; project formats remain compatible.

- 统一许可证文本换行并在构建时检查，避免 Git 规范化后出现本地与 CI 构建指纹/附件哈希不一致。Enforce LF in shipped text to keep local and CI artifacts identical.

## [1.2.3] - 2026-10-10

标签已推送，未发布 Release：发布校验发现许可证文本换行与 Git 归一化不一致，修正后随 1.2.4 发布；不移动原标签。Tagged but not released due to an artifact line-ending mismatch; superseded by 1.2.4 without rewriting the tag.

## [1.2.2] - 2026-10-10

未单独发布，合并入 1.2.4 / Included in 1.2.4; not separately published. 包含 1.2.1 兼容修复。

- 修复 Android 首页路径缺少前导斜杠，导致本地地址被拼成错误主机名的问题；构建与原生 Activity 测试覆盖实际入口。
- 加载失败不再一概提示“WebView 不支持”。新增独立于网页脚本的原生诊断窗口，记录本次/上次启动、设备与内核版本、页面地址、资源状态、网络/HTTP/脚本错误与渲染进程退出。
- 诊断可在首页打开，失败时保留原生入口；支持复制/导出报告、重试本地首页、恢复 APK 内置页面。报告留在本机，不自动上传，恢复不删除项目。
- 保留 WebView 60 兼容构建与离线优先启动。原生接口代号升为 3，本修复需要安装新 APK，不能通过网页补丁修复旧 APK 的启动地址。
- Fix the missing leading slash in the Android start path, which created an incorrect hostname. Add a real Activity startup regression test.
- Replace misleading engine-version advice with native startup diagnostics, available even if the page cannot run. Copy/export local reports, retry the local home, or restore bundled pages without deleting projects.
- Includes the unpublished 1.2.1 compatibility work. Native API 3 requires a new APK; optional update checks never block local startup.

## [1.2.1] - 2026-10-10

未单独发布，合并入 1.2.4 / Included in 1.2.4; not separately published.

- Android 兼容构建目标从 WebView 110 降至 60；转换所有脚本（包含 HTML 启动脚本），补齐数组、对象、Promise、文件读取、DOM 与 ResizeObserver/AbortController 接口；增加旧 CSS 的基础布局回退。
- 启动仅加载本地查看器和项目。一次延迟后台版本检查，3 秒失败静默忽略；补丁只下载暂存，下次启动启用，不自动重载正在使用的页面。
- 首页显示本地版本、Android 与 WebView 版本，便于定位厂商设备差异。原生接口代号升为 2，需要覆盖安装新 APK；项目保存格式不变。
- 添加降级接口、旧语法解析、离线项目首页及更新超时/迟到响应的回归检查。旧设备 WebGL 和 QQ 分享仍需真机验收。
- Target WebView 60+ with downlevel scripts, bundled offline API fallbacks and basic CSS fallbacks; retain Android 7+ as the OS minimum.
- Local-first startup with one deferred, silent, bounded update check. Stage compatible patches for next launch; never reload an active page. Show local runtime versions for diagnosis.
- Native API 2 requires APK installation; saved projects remain compatible. Device/GPU and QQ-share validation is still required.

## [1.2.0] - 2026-10-10

网页正式更新，附带 Android 预览测试版 / Stable website release with an Android preview attachment.

- 新增 Capacitor Android App：离线内置三个查看器、分享/文件管理器导入、项目首页与历史记录。
- 原生流式解压常见 ZIP、7z、RAR、TAR、GZ、BZ2、XZ、ZSTD 等格式；不支持密码、分卷或嵌套压缩包。RAR 变体以 libarchive 能力为准。
- 原子保存项目清单、去重存储源文件；自动保存项目树、勾选、属性标签、颜色与相机，计算结果写入项目。导出/恢复项目备份，提供回收站与空间清理。
- 返回后台暂停解压并取消计算；中断导入保留恢复记录。持续读取采用分块接口。恢复只覆盖已完成保存的操作。
- App 检查网页版本；同主次版本且兼容原生接口的补丁自动安装网页资源，功能版本征求同意，原生变更引导安装 APK。校验官方 HTTPS 地址及 SHA-256，更新失败不替换旧版，启动失败可回退。
- 包含普通刷新的缓存修复；网页不显示任何更新提示。
- 预览 APK 使用独立应用标识与调试签名，尚未发布正式版；QQ 真机分享及设备后台行为需真机验收。

- Offline Capacitor Android app with project history, file/share import and all three viewers.
- Native streamed archive extraction, atomic project state, content deduplication, persistent computed results, project backup/restore and trash/cleanup.
- Background extraction pauses; interrupted imports retain recovery receipts. Bounded bridge reads avoid copying entire text clouds to JavaScript.
- Compatible patch web updates install automatically at project home; feature updates ask first, native changes require APK installation. Official-host and SHA-256 checks, staged activation and startup rollback.
- Includes silent website refresh cache correction. Preview uses a separate package ID and debug signing; real-device QQ sharing remains to be validated.

## [1.1.1] - 2026-10-10

网页修复记录，合并入 v1.2.0，未单独发布 / Website fix record, included in v1.2.0; not separately published.

- 修复普通刷新可能继续使用旧 HTML：启动时绕过缓存校验构建标识，旧入口自动重新请求，验证后才加载查看器脚本。
- 增加内容构建指纹、站内导航版本标识；本地服务器响应使用 no-store。
- 网页不添加更新提示、轮询或检查按钮。防止自动跳转循环；无网络或检查超过 2.5 秒时继续使用现有版本。保留语言和相机书签。
- 第一次从没有此机制的旧版迁移可能仍需强制刷新。离线包需手动替换；普通刷新仍会重置网页版未保存的文件选择。
- Fix stale HTML after ordinary refresh: validate an uncached build manifest before loading viewer scripts, automatically refetch outdated entry pages, and version internal navigation.
- Content fingerprints and no-store local responses. No update banners, polling or check buttons on the website. Redirect-loop protection and bounded offline fallback preserve usability and stored preferences.
- The first migration from older code may require a hard refresh. Offline packages need manual replacement; normal refresh still resets the web session's file selection.

## [1.1.0] - 2026-10-10

网页正式更新 / Stable web release. Android App remains in development.

### 中文

- 显示点比例提供滑块与数字联动，按动画帧合并更新；明确区分显示比例与文件读取上限。
- 高级截图可选纯净画面或已开启的辅助信息；方向、标尺、图例、点数分别开关。快速 PNG 只保存所有可见视窗的渲染像素。
- 点云可逐文件指定显示颜色与恢复全局规则，不重新解析数据、不改变源 RGB/HSV；点云/线框提供全局单色拾色器，立体线可选择渐变终点颜色并禁用不适用选项。
- 三个工具共用 ZIP 导入，保留目录、校验 CRC 与路径，防止部分失败导入；普通 Store/Deflate，解压合计不超过 512 MiB，暂不支持加密/分卷/ZIP64。
- 补充右侧设置核对表与 Android v1.2.0 迁移/持久项目/分享导入计划；本版不包含 APK，网页项目仍为会话状态。

- 相机面板集成快速 PNG 截图和高级 PNG/JPEG/WebP 导出：自定义像素、透明背景、压缩质量、2× 超采样及可见视窗拼接。高级模式使用独立帧缓冲重绘并恢复当前显示。
- 线框与 LOD 可导出真正的 SVG 线框投影；不包含点云、实体面、遮挡或立体线材质，界面明确标注范围。
- 共享 XYZ 朝向与坐标比例尺，保留网格开关；比例尺不假定米制，归一化 LOD 显示布局单位。
- 点云新增圆点、方点、拟球光照及 1–100% 可逆显示抽样，明确实际显示点数；原始属性、计算和数据导出不受影响。
- 线框与 LOD 边线新增实例化圆柱/方柱、线宽与端点渐变；LOD 面新增无光照、柔和及高光显示。

- 三个查看器新增按需运行状态面板：近似 JS 堆内存、几何缓冲数据量、界面刷新率与场景数据规模；不声称测量整机 CPU/GPU 或总显存。
- 三个查看器使用同一个项目栏模板：文件/文件夹导入、拖放提示、搜索、数量、项目树与管理入口位置一致。
- LOD 编号批选与来源信息默认折叠；增加按当前筛选全选/反选，取消固定的 24 栋预览上限。
- 编号范围按已导入模型匹配，避免误输入极大范围时生成海量不存在的编号。
- 顶部数量明确为项目总条目；LOD 不再显示容易误解的 `0 / 24`。
- 三个查看器的“项目”按钮统一放在“立体”左侧，可直接展开或收起项目栏，不再占用额外侧边栏；左上角明确为“首页”，收起侧栏时保留可用的键盘焦点。
- 页脚作者链接显示账号 Sen2Maker，保持中英文和手机布局一致。
- 移除线框和点云查看器顶部图标的矩形底色，与 LOD 查看器统一为透明背景。

### English

- Synchronized display-percentage slider/number controls with frame-coalesced updates; distinguish sampling from per-file read limits.
- Advanced raster export selects clean render or enabled overlays. Axes, ruler, legend and count have independent toggles; quick PNG copies only all visible rendered views.
- Per-cloud display color overrides/reset preserve source RGB/HSV and geometry caches. Add global solid-color and gradient-end pickers; disable inapplicable line controls.
- Shared folder-preserving ZIP import with CRC/path validation and atomic batch insertion. Store/Deflate only, up to 512 MiB expanded; encrypted, split and ZIP64 archives are unsupported.
- Document inspector audit and v1.2.0 Android sharing/project-storage roadmap. No APK is included; web projects remain session-based.

- Shared camera capture: quick PNG and advanced PNG/JPEG/WebP, exact pixel sizes, transparency, quality, 2× supersampling and joined visible views. Offscreen rendering preserves the live view.
- Genuine SVG wireframe projection for wireframe/LOD viewers, with explicit limits: no point clouds, surfaces, occlusion or 3D line materials.
- Shared XYZ orientation and coordinate ruler alongside the existing grid toggle; never assumes meters, uses layout units for normalized LOD.
- Disc, square and sphere-shaded point sprites with reversible 1–100% display sampling and visible counts; source attributes, calculations and data exports stay unchanged.
- Instanced cylindrical/square-prism edges, width and endpoint gradients in wireframe/LOD; unlit, soft and glossy LOD surface shading.

- Add shared on-demand runtime diagnostics: approximate JS heap, geometry buffer bytes, sampled UI refresh and scene data counts; no claims of system CPU/GPU or total VRAM measurement.
- One shared project-sidebar template aligns import, drop hint, search, counts, tree and management controls across all viewers.
- Collapse LOD-specific ID selection and source details. Add filtered select/invert actions without the previous fixed 24-model preview limit.
- Resolve ranges against imported model IDs without allocating huge numeric intervals.
- Label total project items clearly; replace the ambiguous LOD `0 / 24` counter.
- Place the shared Project toggle before the 3D view controls in all three viewers, without an extra side rail; keep Home at the upper left and preserve usable keyboard focus when collapsing the sidebar.
- Display Sen2Maker as the author link in both languages and responsive layouts.
- Remove the rectangular backgrounds behind wireframe and point-cloud header icons to match the transparent LOD icon.

Validation: regression suites and generated-asset/package checks passed; desktop/mobile Chinese/English UI, 25-model display, filtered selection, removal, wireframe/point imports and runtime counts verified. Wireframe still previews one building group; multiselect manages entries rather than overlaying buildings.

## [1.0.0] - 2026-10-09

首次正式版本 / First stable release.

### 中文

- 提供 网格模型、通用 OBJ 线框和点云三个查看器，支持在线及离线运行，数据在本机处理。
- 共用项目文件树：追加导入、目录分组、多选/框选、右键移动与移除。
- 点云支持多文件叠加、RGB/HSV 与自定义属性映射、按需几何特征计算、列顺序调整及合并导出。
- 提供色带、相机微调、浏览器书签和 JSON 导入导出；线框支持最多三个同步对比面板。
- 中英文界面、语言加载提示、手机布局和统一工具图标。
- 完善双语项目介绍、搜索描述、规范网址和站点地图；网页增加作者主页、仓库及版本链接。
- 建立统一版本号、发布检查和更新日志；发布正式 Release 后再部署网站。

### English

- Three online/offline viewers for meshes, general OBJ wireframes and point clouds; all data processing stays local.
- Shared project tree with appended imports, folder groups, multiselect, box selection and context actions.
- Point-cloud overlays, RGB/HSV and custom attribute mapping, selected geometric computations, column ordering and merged export.
- Palettes, camera controls, persistent browser bookmarks and JSON import/export; up to three synchronized wireframe comparison panes.
- Chinese/English UI, localized startup feedback, mobile layouts and consistent tool icons.
- Bilingual project and search descriptions, canonical URLs, sitemap, author/repository links and version links.
- A single version source, release checks and changelog; website deployment follows a published stable Release.

### 使用 / Download

下载 `BuildingWebViewer-v1.0.0.zip`，完整解压后双击 `index.html`；也可运行 `python3 server.py`。`SHA256SUMS.txt` 用于验证下载内容。ZIP 包含可直接运行的网页、源码、文档和测试，不含用户数据。

Download `BuildingWebViewer-v1.0.0.zip`, extract everything and open `index.html`, or run `python3 server.py`. Verify the download with `SHA256SUMS.txt`. The archive includes ready-to-run pages, source, docs and tests, without datasets.

### 已知限制 / Known limitations

- 暂不支持 LAS/LAZ 和压缩 PCD；大数据容量取决于设备内存与显卡。LAS/LAZ and compressed PCD are unsupported; large datasets depend on RAM/GPU capacity.
- 刷新后需重新导入文件；项目文件夹仅在当前会话保留，书签可持久保存。Files must be reimported after refresh; project folders are session-only, while bookmarks persist.
- LOD 使用展示排布；点云保留原始坐标；线框每次预览一个建筑组。LOD uses a display arrangement; clouds retain original coordinates; wireframe previews one building set at a time.

[Unreleased]: https://github.com/Sen2Maker/BuildingWebViewer/compare/v1.0.0...main
[1.0.0]: https://github.com/Sen2Maker/BuildingWebViewer/releases/tag/v1.0.0
