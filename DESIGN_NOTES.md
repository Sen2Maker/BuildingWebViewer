# 加载与显示设计说明

本次修改借鉴公开项目的架构思路，网页代码独立实现，不引入桌面程序或复制其实现。

## 参考与选择

| 官方资料 | 观察到的做法 | BuildingWebViewer 的应用 |
| --- | --- | --- |
| [MeshLab 场景与 GPU 数据管理源码](https://github.com/cnr-isti-vclab/meshlab/blob/main/src/common/ml_shared_data_context/ml_scene_gl_shared_data_context.cpp) | 按 mesh 管理渲染资源与每个视窗的显示参数；属性变化与几何变化区分处理 | 按文件保留点云实体与 GPU 数据，改变选集不拼接全部点；显示选项独立更新 |
| [MeshLab 图层界面源码](https://github.com/cnr-isti-vclab/meshlab/blob/main/src/meshlab/layerDialog.cpp) | 图层可见性独立于模型数据 | 文件选择控制场景成员，解析缓存独立于勾选数量 |
| [CloudCompare 显示设置](https://cloudcompare.org/doc/wiki/index.php/Display%5CDisplay_settings) | 文档介绍 VBO、交互时简化显示与动态标量颜色显示等设置 | 本次采用 GPU 资源复用、配色参数与几何分离；没有把交互时简化直接等同于永久删点 |
| [CloudCompare 色标管理](https://www.cloudcompare.org/doc/wiki/index.php/Scalar_fields%5CColor_Scales_Manager) | 多色标，以及相对/绝对数值范围 | 多种色带、反转、自动/固定数值范围 |
| [CloudCompare 视口实体](https://www.cloudcompare.org/doc/wiki/index.php/Entities#Viewport) | 视口可保存并恢复 | 命名视角与可移植的 JSON 导入/导出 |
| [CloudCompare 投影模式](https://www.cloudcompare.org/doc/wiki/index.php/Display_modes) | 区分正交与透视相机 | 当前维持正交模型，保存观察中心、角度、平移与尺度 |

资料核查于 2026-10-08；CloudCompare 的部分 wiki 页面描述较旧版本，以上仅
引用其设计概念，不断言每个版本/显卡的默认设置相同。

## 本项目的实现

- TXT/XYZ/CSV/PTS 使用单遍分块解析；默认全量，有限上限使用固定种子的
  Algorithm R 蓄水池采样。此方案是针对浏览器顺序文件读取的独立选择，
  不宣称是 MeshLab 或 CloudCompare 的原始加载算法。
- 每文件上限不随选集大小变化。缓存拥有的细节足够时，从内存生成较小样本；
  只有缺少所需细节或该文件缓存被回收，才重新读取该文件。
- CPU 文件缓存按实际 TypedArray 大小估算，默认 256 MiB 预算及 64 个文件。
  活跃文件不会被静默丢弃；超预算时优先回收未选文件。因此这不是整个页面的
  硬性内存上限，GPU、浏览器和临时解析空间还会额外占用内存。
- 各点云保留自己的坐标缓冲，以局部原点上传 Float32 GPU 坐标；相机保存
  原坐标观察中心，避免百万级坐标和选集居中变化导致错位。
- LOD 模型重新排列，不能冒充原地理坐标场景。其相机记录必须匹配模型编号
  和比例模式，点云/线框与 LOD 视角文件分属不同坐标空间。

## 范围

本次解决首次双遍读取、增选重复解析、场景数据拼接、配色和相机管理。
没有实现磁盘分块索引、网络流式瓦片、完整空间 LOD 或透视相机。
[CloudCompare 自身也明确区分用于空间查询的八叉树和显示 LOD](https://cloudcompare.org/doc/wiki/index.php/CloudCompare_octree)。
不能仅仅加一个“八叉树”就宣称任意超大文件都能流畅显示。
