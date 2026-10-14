# 名称与能力边界 / Terminology

- **网格模型 / Mesh**：由顶点、边和面描述的几何。当前网格工具读取 OBJ 三角面；不限定建筑。
- **细节层次 / Level of Detail (LoD)**：模型细节程度的表达。建筑语境中的 LoD2 是具体层级，不能用来泛指所有网格。旧工具名称曾为“LOD 模型”，现统一为 Mesh Viewer；`lod.html` 和书签坐标标识保留兼容。
- **线框 / Wireframe**：以线段呈现边界或结构，不表示已经恢复实体表面。按对象目录组织，建筑只是其中一种输入。
- **点云 / Point cloud**：XYZ 点及附加属性；列标签说明含义，不自动改变数值单位或进行坐标系转换。
- **三维高斯 / 3D Gaussian Splatting**：带不透明度、尺度、旋转与颜色等属性的高斯集合，普通 XYZ / PLY 点云不等于 3DGS。

网格相对高度以每个模型的最低 Z 为零点；面朝向颜色按法向方向区分，不判断屋顶或墙体。网页与 App 的保存、编辑和相机文件能力见 README / Android 指南。

Mesh describes surface geometry, while LoD describes detail level. Wireframes show lines; point clouds store positions and optional attributes; Gaussian splats require additional 3DGS properties. Relative height and orientation colors are geometric measures, not semantic building labels. Historical Release prose uses these terms while preserving each version’s original capabilities and installation requirements. Tags and assets remain unchanged.
