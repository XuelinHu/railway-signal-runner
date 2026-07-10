# Web3D Scene Editor 平台开发 Skills 技术文档

> 文件类型：`skills.md`  
> 适用场景：使用 AI 编程助手、Codex、Cursor、Claude Code、Trae、CodeBuddy 等工具，从 0 到 1 开发一个支持 GLB 模型资源库、三维拖拽摆放、第一人称漫游、Blender 式移动/旋转/缩放、楼层/图层切换、场景保存与恢复的 Web 3D 编辑平台。  
> 推荐前端：Vue 3 + Vite + TypeScript + Three.js + Pinia  
> 推荐后端：Spring Boot / Node.js 二选一，资源存储使用 MinIO / OSS / 本地文件服务，数据库使用 PostgreSQL / MySQL。  
> 核心目标：把这个平台做成“轻量级 Web 版 Blender + 游戏式场景搭建器 + GLB 模型资源管理平台”。

---

## 0. 使用说明

本文件不是普通需求说明，而是给开发团队或 AI 编程 Agent 使用的完整开发技能文档。开发时应严格遵守以下原则：

1. **先搭 MVP，再扩展高级能力**。第一版必须跑通模型库、GLB 加载、拖拽放置、选中、移动/旋转/缩放、保存/恢复。
2. **所有三维对象都必须可序列化**。场景里每个模型的位置、旋转、缩放、楼层、图层、资源 ID、业务元数据都必须保存为 JSON。
3. **Three.js 对象不直接作为业务数据保存**。业务数据保存在 Pinia Store 或后端数据库中，Three.js Scene 只是渲染结果。
4. **编辑模式与漫游模式必须分离**。编辑模式用于摆放和调整模型，漫游模式用于第一人称查看场景。
5. **模型资产必须统一标准**。GLB 模型需要控制尺寸、原点、朝向、贴图大小、面数、压缩方式，否则后期编辑体验会很差。
6. **所有交互都要支持撤销/重做**。至少支持添加、删除、移动、旋转、缩放、修改属性。
7. **平台要预留后续扩展**：碰撞检测、吸附、测量、标注、路径漫游、模型动画、设备状态绑定、数字孪生数据接入。

---

## 1. 平台定位

### 1.1 平台名称建议

可选名称：

- `Web3D Scene Builder`
- `GLB Scene Editor`
- `3D Asset Layout Platform`
- `DigitalTwin Scene Editor`
- `Vue Three Scene Studio`
- `轻量级三维场景搭建平台`

### 1.2 平台一句话描述

本平台是一个基于 Web 的三维场景编辑器，支持用户从左侧 GLB 模型资源库中拖拽模型到三维场景中，像游戏或 Blender 一样进行摆放、移动、旋转、缩放、楼层切换、第一人称漫游，并可将场景结构保存为 JSON 后再次加载恢复。

### 1.3 典型应用场景

1. 无人机部件组装展示。
2. 数字孪生场景快速搭建。
3. 铁路设备、机场设备、实训设备三维布置。
4. 教学实训三维交互平台。
5. 低代码 3D 场景配置平台。
6. 应急演练、灾害巡检、管网/站场设备布设。
7. 模型资源管理与三维预览平台。

---

## 2. 总体功能目标

### 2.1 MVP 必须实现的功能

第一版必须完成以下功能：

| 模块 | 功能 | 必须程度 |
|---|---|---|
| 模型资源库 | 左侧显示 GLB 模型卡片 | 必须 |
| 模型预览 | 鼠标悬浮或点击可预览模型 | 必须 |
| 拖拽放置 | 从左侧模型库拖到 3D 场景中 | 必须 |
| 射线落点 | 根据鼠标位置计算地面放置点 | 必须 |
| 模型实例 | 支持同一个 GLB 资源多次放置 | 必须 |
| 选中对象 | 点击场景模型后选中 | 必须 |
| 移动/旋转/缩放 | 使用三轴 Gizmo 操作 | 必须 |
| 快捷键 | W/E/R 切换移动/旋转/缩放 | 必须 |
| 删除 | Delete 删除选中模型 | 必须 |
| 保存场景 | 保存为 JSON | 必须 |
| 加载场景 | 根据 JSON 恢复场景 | 必须 |
| 第一人称漫游 | WASD + 鼠标控制视角 | 必须 |
| 编辑/漫游模式 | 两种模式切换 | 必须 |
| 右侧属性面板 | 展示并编辑位置、旋转、缩放、名称等 | 必须 |

### 2.2 第二阶段功能

| 模块 | 功能 |
|---|---|
| 撤销/重做 | Ctrl+Z / Ctrl+Y |
| 网格吸附 | 按 Ctrl 或开启吸附后按网格移动 |
| 楼层切换 | 1F/2F/3F 或自定义楼层 |
| 图层管理 | 设备层、管线层、标注层、地形层 |
| 复制粘贴 | Ctrl+C / Ctrl+V 复制模型 |
| 对齐工具 | 左对齐、居中、等距分布 |
| 碰撞检测 | 避免模型穿插或非法摆放 |
| 模型搜索 | 按名称、标签、分类检索资源 |
| 模型分类 | 无人机、设备、建筑、传感器等 |
| 场景缩略图 | 保存场景时生成封面图 |
| 模型压缩 | Draco / Meshopt / 贴图压缩 |

### 2.3 第三阶段高级功能

| 模块 | 功能 |
|---|---|
| 多人协同 | 多用户同时编辑同一场景 |
| 权限管理 | 管理员、编辑者、查看者 |
| 版本管理 | 场景版本回退 |
| 动画绑定 | 模型开关、旋转、移动动画 |
| 数据绑定 | 模型与设备状态、传感器数据绑定 |
| 路径漫游 | 设置漫游路线和关键帧 |
| 测距工具 | 点到点距离、面积、高度测量 |
| 标注系统 | 文字、箭头、图标、说明牌 |
| 发布分享 | 场景发布成只读预览链接 |
| 离线缓存 | 模型和场景缓存到 IndexedDB |

---

## 3. 技术可行性结论

该平台技术上完全可实现。核心依据如下：

1. GLB/GLTF 是 Web 3D 中非常主流的模型格式，Three.js 可以通过 `GLTFLoader` 加载。
2. 鼠标拾取、点击选中、拖拽落点计算可以通过 `Raycaster` 实现。
3. 三维对象的移动、旋转、缩放可以通过 `TransformControls` 实现，其交互方式类似 Blender 等 DCC 工具。
4. 第一人称漫游可以通过 `PointerLockControls` 实现。
5. 三维拖拽可以使用 `DragControls`，也可以自定义 HTML 拖拽 + Raycaster 放置逻辑。
6. 场景数据可以序列化为 JSON，保存每个实例的资源 ID、位置、旋转、缩放和业务属性。

---

## 4. 推荐技术栈

### 4.1 前端技术栈

```txt
Vue 3
Vite
TypeScript
Three.js
Pinia
Vue Router
Element Plus / Naive UI / Ant Design Vue
@vueuse/core
axios
lodash-es
mitt
nanoid / uuid
```

### 4.2 Three.js 相关模块

```ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { DragControls } from 'three/addons/controls/DragControls.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
```

### 4.3 后端技术栈方案 A：Spring Boot

```txt
Spring Boot 3.x
Spring Web
Spring Security / Sa-Token
MyBatis-Plus / JPA
PostgreSQL / MySQL
MinIO SDK
Redis
Knife4j / Swagger
```

### 4.4 后端技术栈方案 B：Node.js

```txt
NestJS / Express / Fastify
TypeScript
Prisma / TypeORM
PostgreSQL / MySQL
MinIO SDK
Redis
JWT
Swagger
```

### 4.5 存储方案

| 类型 | 推荐存储 |
|---|---|
| GLB 文件 | MinIO / OSS / 本地文件服务 |
| 贴图文件 | MinIO / OSS / CDN |
| 模型缩略图 | MinIO / OSS |
| 场景 JSON | 数据库存 JSONB 字段或文件存储 |
| 场景封面图 | MinIO / OSS |
| 用户数据 | 数据库 |
| 操作日志 | 数据库 / Elasticsearch |

---

## 5. 总体架构设计

### 5.1 系统架构图

```txt
┌─────────────────────────────────────────────────────────────┐
│                         用户浏览器                           │
│                                                             │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐ │
│  │ 左侧模型库    │   │ Three.js 3D 场景  │   │ 右侧属性面板  │ │
│  │ Asset Panel  │   │ Scene Editor      │   │ Inspector    │ │
│  └──────┬───────┘   └────────┬─────────┘   └──────┬───────┘ │
│         │                    │                    │         │
│         └──────────────┬─────┴──────┬─────────────┘         │
│                        │ Pinia Store │                       │
│                        └─────┬───────┘                       │
└──────────────────────────────┼──────────────────────────────┘
                               │ REST API
┌──────────────────────────────┼──────────────────────────────┐
│                           后端服务                            │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────────┐ │
│  │ 模型资源接口 │  │ 场景管理接口 │  │ 用户/权限/日志接口      │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬────────────┘ │
│         │                │                    │              │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────────▼────────────┐ │
│  │ MinIO/OSS   │  │ PostgreSQL  │  │ Redis / Log Storage   │ │
│  └─────────────┘  └─────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 前端页面结构

```txt
┌──────────────────────────────────────────────────────────────┐
│ 顶部工具栏                                                     │
│ 保存 | 加载 | 撤销 | 重做 | 编辑模式 | 漫游模式 | 楼层 | 导出    │
├──────────────┬──────────────────────────────┬────────────────┤
│ 左侧模型库     │ 中间 Three.js 画布             │ 右侧属性面板     │
│              │                              │                │
│ 搜索框         │ 网格地面                       │ 模型名称         │
│ 分类树         │ GLB 模型                       │ 位置 XYZ         │
│ 模型卡片       │ Transform Gizmo                │ 旋转 XYZ         │
│ 缩略图         │ 第一人称漫游                    │ 缩放 XYZ         │
│ 简介 tooltip   │ 选中轮廓                       │ 所属楼层         │
│ 拖拽源         │                              │ 自定义属性       │
├──────────────┴──────────────────────────────┴────────────────┤
│ 底部状态栏：当前模式、坐标、选中对象、FPS、模型数量、保存状态       │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. 前端目录结构建议

```txt
src/
├── main.ts
├── App.vue
├── router/
│   └── index.ts
├── stores/
│   ├── scene.store.ts          # 场景实例数据
│   ├── asset.store.ts          # 模型资源数据
│   ├── editor.store.ts         # 编辑器状态
│   ├── history.store.ts        # 撤销/重做历史
│   └── user.store.ts
├── views/
│   ├── SceneEditorView.vue     # 主编辑器页面
│   ├── ScenePreviewView.vue    # 只读预览页面
│   └── AssetManagerView.vue    # 模型资源管理页面
├── components/
│   ├── layout/
│   │   ├── EditorHeader.vue
│   │   ├── EditorStatusBar.vue
│   │   └── SplitPanel.vue
│   ├── asset/
│   │   ├── AssetPanel.vue
│   │   ├── AssetCard.vue
│   │   ├── AssetTooltip.vue
│   │   ├── AssetPreviewDialog.vue
│   │   └── AssetUploadDialog.vue
│   ├── editor/
│   │   ├── ThreeCanvas.vue
│   │   ├── InspectorPanel.vue
│   │   ├── LayerPanel.vue
│   │   ├── FloorSwitcher.vue
│   │   ├── Toolbar.vue
│   │   ├── ShortcutHelp.vue
│   │   └── MiniMap.vue
│   └── common/
│       ├── NumberVectorInput.vue
│       └── ConfirmDialog.vue
├── three/
│   ├── core/
│   │   ├── ThreeEngine.ts       # 场景、相机、渲染器、循环
│   │   ├── SceneManager.ts      # 对象添加、删除、查询
│   │   ├── CameraManager.ts     # 编辑相机、漫游相机
│   │   ├── RendererManager.ts
│   │   └── LightManager.ts
│   ├── loaders/
│   │   ├── ModelLoader.ts       # GLB/GLTF 加载与缓存
│   │   └── TextureLoader.ts
│   ├── controls/
│   │   ├── EditorControls.ts    # Orbit + Transform
│   │   ├── FirstPersonController.ts
│   │   ├── PlacementController.ts
│   │   ├── SelectionController.ts
│   │   └── ShortcutController.ts
│   ├── helpers/
│   │   ├── GridHelper.ts
│   │   ├── AxisHelper.ts
│   │   ├── OutlineHelper.ts
│   │   ├── BoundsHelper.ts
│   │   └── MeasureHelper.ts
│   ├── utils/
│   │   ├── raycast.ts
│   │   ├── transform.ts
│   │   ├── dispose.ts
│   │   ├── cloneModel.ts
│   │   ├── normalizeModel.ts
│   │   └── screenshot.ts
│   └── types/
│       └── three-editor.types.ts
├── api/
│   ├── asset.api.ts
│   ├── scene.api.ts
│   ├── upload.api.ts
│   └── user.api.ts
├── types/
│   ├── asset.types.ts
│   ├── scene.types.ts
│   ├── editor.types.ts
│   └── api.types.ts
├── utils/
│   ├── id.ts
│   ├── math.ts
│   ├── file.ts
│   └── debounce.ts
└── styles/
    ├── index.scss
    └── editor.scss
```

---

## 7. 核心数据模型

### 7.1 模型资源 Asset

模型资源表示“左侧资源库中的一个 GLB 文件”，不是场景中的实例。

```ts
export interface AssetItem {
  id: string
  name: string
  code?: string
  categoryId?: string
  categoryName?: string
  description?: string
  tags: string[]

  // 文件资源
  glbUrl: string
  thumbnailUrl?: string
  previewImageUrl?: string
  fileSize?: number
  fileHash?: string

  // 模型默认参数
  defaultScale: [number, number, number]
  defaultRotation: [number, number, number]
  defaultPosition?: [number, number, number]
  originPolicy?: 'center-bottom' | 'center' | 'raw'
  unit?: 'm' | 'cm' | 'mm'

  // 模型质量信息
  triangleCount?: number
  vertexCount?: number
  textureCount?: number
  hasAnimation?: boolean
  hasDraco?: boolean
  hasMeshopt?: boolean

  // 业务信息
  metadata?: Record<string, any>

  createdAt?: string
  updatedAt?: string
}
```

### 7.2 场景实例 SceneObject

场景实例表示“用户已经拖进场景里的一个模型对象”。一个 Asset 可以产生多个 SceneObject。

```ts
export interface SceneObject {
  id: string
  assetId: string
  name: string
  type: 'model' | 'group' | 'light' | 'camera' | 'annotation' | 'primitive'

  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]

  visible: boolean
  locked: boolean
  selectable: boolean
  castShadow: boolean
  receiveShadow: boolean

  floorId?: string
  layerId?: string
  parentId?: string

  // 业务属性，例如设备编号、传感器 ID、状态等
  metadata?: Record<string, any>

  createdAt?: string
  updatedAt?: string
}
```

### 7.3 场景 SceneDocument

```ts
export interface SceneDocument {
  id: string
  name: string
  description?: string
  version: string

  camera: SceneCameraState
  environment: SceneEnvironment
  grid: SceneGridConfig
  floors: SceneFloor[]
  layers: SceneLayer[]
  objects: SceneObject[]

  thumbnailUrl?: string
  metadata?: Record<string, any>

  createdBy?: string
  createdAt?: string
  updatedAt?: string
}
```

### 7.4 相机状态

```ts
export interface SceneCameraState {
  mode: 'orbit' | 'first-person' | 'top' | 'front' | 'right' | 'custom'
  position: [number, number, number]
  rotation: [number, number, number]
  target?: [number, number, number]
  fov: number
  near: number
  far: number
}
```

### 7.5 楼层数据

```ts
export interface SceneFloor {
  id: string
  name: string
  index: number
  elevation: number
  height?: number
  visible: boolean
  locked?: boolean
}
```

### 7.6 图层数据

```ts
export interface SceneLayer {
  id: string
  name: string
  type?: 'device' | 'building' | 'pipe' | 'annotation' | 'terrain' | 'custom'
  visible: boolean
  locked: boolean
  color?: string
  order: number
}
```

### 7.7 场景 JSON 示例

```json
{
  "id": "scene_001",
  "name": "无人机零件装配场景",
  "version": "1.0.0",
  "camera": {
    "mode": "orbit",
    "position": [8, 6, 10],
    "rotation": [0, 0, 0],
    "target": [0, 0, 0],
    "fov": 60,
    "near": 0.1,
    "far": 2000
  },
  "environment": {
    "background": "#1e1e1e",
    "ambientLightIntensity": 0.7,
    "directionalLightIntensity": 1.2
  },
  "grid": {
    "visible": true,
    "size": 100,
    "division": 100,
    "snapEnabled": true,
    "snapSize": 0.5
  },
  "floors": [
    { "id": "floor_1", "name": "1F", "index": 1, "elevation": 0, "visible": true }
  ],
  "layers": [
    { "id": "layer_device", "name": "设备层", "visible": true, "locked": false, "order": 1 }
  ],
  "objects": [
    {
      "id": "obj_001",
      "assetId": "asset_drone_motor_001",
      "name": "无人机电机 01",
      "type": "model",
      "position": [1.5, 0, 2.0],
      "rotation": [0, 1.5708, 0],
      "scale": [1, 1, 1],
      "visible": true,
      "locked": false,
      "selectable": true,
      "castShadow": true,
      "receiveShadow": true,
      "floorId": "floor_1",
      "layerId": "layer_device",
      "metadata": {
        "deviceCode": "MOTOR-001",
        "remark": "示例模型"
      }
    }
  ]
}
```

---

## 8. Three.js 编辑器核心设计

### 8.1 ThreeEngine 职责

`ThreeEngine` 是整个三维编辑器的核心入口，负责：

1. 创建 Scene。
2. 创建 Camera。
3. 创建 WebGLRenderer。
4. 初始化灯光。
5. 初始化地面网格。
6. 初始化 OrbitControls。
7. 初始化 TransformControls。
8. 初始化 Raycaster。
9. 管理渲染循环。
10. 监听窗口尺寸变化。
11. 销毁资源。

### 8.2 ThreeEngine 基础骨架

```ts
export class ThreeEngine {
  container!: HTMLElement
  scene!: THREE.Scene
  camera!: THREE.PerspectiveCamera
  renderer!: THREE.WebGLRenderer
  clock = new THREE.Clock()

  init(container: HTMLElement) {
    this.container = container
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      2000
    )
    this.camera.position.set(8, 6, 10)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    container.appendChild(this.renderer.domElement)

    this.initLights()
    this.initGrid()
    this.animate()
  }

  initLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.7)
    this.scene.add(ambient)

    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(10, 15, 10)
    dir.castShadow = true
    this.scene.add(dir)
  }

  initGrid() {
    const grid = new THREE.GridHelper(100, 100)
    grid.name = '__grid__'
    this.scene.add(grid)
  }

  animate = () => {
    requestAnimationFrame(this.animate)
    this.renderer.render(this.scene, this.camera)
  }

  resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  dispose() {
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
```

---

## 9. GLB 模型加载与缓存

### 9.1 设计原则

1. 同一个 GLB 资源不要重复请求。
2. 一个资源可以产生多个实例。
3. 每次放置到场景中的模型应当是克隆对象。
4. 加载后的模型要统一缩放、居中、修正原点。
5. 需要处理贴图色彩空间。
6. 删除模型时要区分“实例删除”和“资源缓存释放”。

### 9.2 ModelLoader 设计

```ts
export class ModelLoader {
  private loader: GLTFLoader
  private cache = new Map<string, THREE.Group>()

  constructor() {
    this.loader = new GLTFLoader()

    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/draco/')
    this.loader.setDRACOLoader(dracoLoader)

    this.loader.setMeshoptDecoder(MeshoptDecoder)
  }

  async load(asset: AssetItem): Promise<THREE.Group> {
    if (this.cache.has(asset.id)) {
      return this.clone(this.cache.get(asset.id)!)
    }

    const gltf = await this.loader.loadAsync(asset.glbUrl)
    const model = gltf.scene

    this.normalizeModel(model, asset)
    this.setupModel(model)

    this.cache.set(asset.id, model)
    return this.clone(model)
  }

  private setupModel(model: THREE.Group) {
    model.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.userData.selectable = true

        if (child.material?.map) {
          child.material.map.colorSpace = THREE.SRGBColorSpace
        }
      }
    })
  }

  private normalizeModel(model: THREE.Group, asset: AssetItem) {
    const box = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    if (asset.originPolicy === 'center-bottom') {
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= box.min.y
    } else if (asset.originPolicy === 'center') {
      model.position.sub(center)
    }

    model.scale.set(
      asset.defaultScale?.[0] ?? 1,
      asset.defaultScale?.[1] ?? 1,
      asset.defaultScale?.[2] ?? 1
    )
  }

  private clone(model: THREE.Group): THREE.Group {
    const cloned = model.clone(true)
    cloned.traverse((child: any) => {
      if (child.isMesh) {
        child.material = child.material.clone()
      }
    })
    return cloned
  }
}
```

### 9.3 模型克隆注意事项

普通 `object.clone(true)` 对简单静态模型够用；如果模型包含骨骼动画、SkinnedMesh，需要使用 `SkeletonUtils.clone()`。

```ts
import { clone } from 'three/addons/utils/SkeletonUtils.js'

const clonedModel = clone(originalModel)
```

---

## 10. 左侧模型库设计

### 10.1 模型卡片内容

每个模型卡片显示：

```txt
缩略图
模型名称
模型分类
简短描述
标签
文件大小
是否已压缩
是否包含动画
```

### 10.2 鼠标悬浮交互

鼠标悬浮在模型卡片上时：

1. 显示模型简介。
2. 显示大图或小型 Three.js 预览。
3. 显示“拖动到场景中”提示。
4. 显示模型尺寸、面数、文件大小。

### 10.3 拖拽数据格式

HTML 拖拽开始时，应设置资源 ID：

```ts
function onAssetDragStart(event: DragEvent, asset: AssetItem) {
  event.dataTransfer?.setData('application/x-asset-id', asset.id)
  event.dataTransfer?.setData('text/plain', asset.id)
  event.dataTransfer!.effectAllowed = 'copy'
}
```

### 10.4 AssetCard 示例结构

```vue
<template>
  <div
    class="asset-card"
    draggable="true"
    @dragstart="onDragStart"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <img :src="asset.thumbnailUrl" class="asset-card__thumb" />
    <div class="asset-card__body">
      <div class="asset-card__name">{{ asset.name }}</div>
      <div class="asset-card__desc">{{ asset.description }}</div>
    </div>
  </div>
</template>
```

---

## 11. 从左侧拖入 3D 场景

### 11.1 推荐实现方式

不要直接使用 Three.js `DragControls` 来完成“左侧 UI 拖到 3D 场景”的过程。更推荐：

```txt
HTML DragStart
→ Canvas DragOver
→ Raycaster 计算地面交点
→ 显示半透明预览模型
→ Canvas Drop
→ 创建 SceneObject 数据
→ 加载/克隆 GLB
→ 添加到 Three.js Scene
→ 同步 Pinia Store
```

### 11.2 地面 Plane 设计

为了计算落点，应创建一个不可见的地面平面：

```ts
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.MeshBasicMaterial({ visible: false })
)
groundPlane.rotation.x = -Math.PI / 2
groundPlane.name = '__ground_plane__'
scene.add(groundPlane)
```

### 11.3 Raycaster 计算落点

```ts
export function getMouseNdc(event: MouseEvent, dom: HTMLElement) {
  const rect = dom.getBoundingClientRect()
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )
}

export function raycastGround(
  event: MouseEvent,
  camera: THREE.Camera,
  dom: HTMLElement,
  ground: THREE.Object3D
): THREE.Vector3 | null {
  const mouse = getMouseNdc(event, dom)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObject(ground, true)
  return hits.length ? hits[0].point.clone() : null
}
```

### 11.4 拖拽放置伪代码

```ts
async function onCanvasDrop(event: DragEvent) {
  event.preventDefault()

  const assetId = event.dataTransfer?.getData('application/x-asset-id')
  if (!assetId) return

  const asset = assetStore.getById(assetId)
  const point = placementController.getDropPoint(event)
  if (!point) return

  const sceneObject: SceneObject = {
    id: createId('obj'),
    assetId: asset.id,
    name: asset.name,
    type: 'model',
    position: [point.x, point.y, point.z],
    rotation: asset.defaultRotation ?? [0, 0, 0],
    scale: asset.defaultScale ?? [1, 1, 1],
    visible: true,
    locked: false,
    selectable: true,
    castShadow: true,
    receiveShadow: true,
    floorId: editorStore.currentFloorId,
    layerId: editorStore.currentLayerId,
    metadata: {}
  }

  sceneStore.addObject(sceneObject)
  await sceneManager.addSceneObject(sceneObject)
  historyStore.push({ type: 'ADD_OBJECT', payload: sceneObject })
}
```

---

## 12. 选中模型设计

### 12.1 点击选中流程

```txt
鼠标点击 Canvas
→ Raycaster 从相机发射射线
→ 检测可选 Mesh
→ 向上查找所属 SceneObject 根节点
→ 设置 selectedObjectId
→ TransformControls attach 到该对象
→ 右侧属性面板显示对象属性
→ 对象显示描边或包围盒
```

### 12.2 对象 userData 设计

添加模型时，必须在根节点和子 Mesh 上写入实例 ID：

```ts
function bindObjectUserData(root: THREE.Object3D, sceneObject: SceneObject) {
  root.userData.sceneObjectId = sceneObject.id
  root.userData.assetId = sceneObject.assetId
  root.userData.isSceneObjectRoot = true

  root.traverse(child => {
    child.userData.sceneObjectId = sceneObject.id
    child.userData.selectable = sceneObject.selectable
  })
}
```

### 12.3 SelectionController 伪代码

```ts
class SelectionController {
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private dom: HTMLElement,
    private objectMap: Map<string, THREE.Object3D>
  ) {}

  pick(event: MouseEvent): string | null {
    const rect = this.dom.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.mouse, this.camera)
    const hits = this.raycaster.intersectObjects(this.scene.children, true)

    for (const hit of hits) {
      const id = hit.object.userData.sceneObjectId
      if (id) return id
    }

    return null
  }
}
```

---

## 13. TransformControls：移动、旋转、缩放

### 13.1 基础要求

选中模型后，出现三维变换控件，支持：

```txt
W：移动 translate
E：旋转 rotate
R：缩放 scale
X：锁定/切换 X 轴
Y：锁定/切换 Y 轴
Z：锁定/切换 Z 轴
Delete：删除
Esc：取消选中
Ctrl+Z：撤销
Ctrl+Y：重做
```

### 13.2 TransformControls 初始化

```ts
const transformControls = new TransformControls(camera, renderer.domElement)
transformControls.setMode('translate')
scene.add(transformControls)
```

### 13.3 与 OrbitControls 互斥

当拖动 TransformControls 时，需要禁用 OrbitControls，防止相机跟着乱动。

```ts
transformControls.addEventListener('dragging-changed', event => {
  orbitControls.enabled = !event.value
})
```

### 13.4 变换同步到 Store

```ts
transformControls.addEventListener('objectChange', () => {
  const object = transformControls.object
  if (!object) return

  const id = object.userData.sceneObjectId
  if (!id) return

  sceneStore.updateTransform(id, {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z]
  })
})
```

### 13.5 变换结束时写入历史记录

不要在 `objectChange` 的每一帧都写入历史记录，否则历史栈会爆炸。正确做法：

```txt
mouseDown：记录变换前状态
objectChange：实时同步 Store
mouseUp：记录变换后状态，形成一条历史记录
```

伪代码：

```ts
let beforeTransform: SceneObject | null = null

transformControls.addEventListener('mouseDown', () => {
  const id = transformControls.object?.userData.sceneObjectId
  beforeTransform = id ? cloneDeep(sceneStore.getObject(id)) : null
})

transformControls.addEventListener('mouseUp', () => {
  const id = transformControls.object?.userData.sceneObjectId
  const after = id ? cloneDeep(sceneStore.getObject(id)) : null

  if (beforeTransform && after) {
    historyStore.push({
      type: 'TRANSFORM_OBJECT',
      before: beforeTransform,
      after
    })
  }

  beforeTransform = null
})
```

---

## 14. 第一人称漫游模式

### 14.1 模式切换原则

平台必须有两个主要模式：

| 模式 | 控制方式 | 用途 |
|---|---|---|
| 编辑模式 | OrbitControls + TransformControls | 拖拽摆放、编辑模型 |
| 漫游模式 | PointerLockControls + WASD | 第一人称进入场景查看 |

### 14.2 漫游模式操作

```txt
W：前进
S：后退
A：左移
D：右移
Q：下降
E：上升
Shift：加速
鼠标移动：转动视角
Esc：退出鼠标锁定
Tab：切回编辑模式
```

### 14.3 FirstPersonController 骨架

```ts
class FirstPersonController {
  controls: PointerLockControls
  velocity = new THREE.Vector3()
  direction = new THREE.Vector3()

  moveForward = false
  moveBackward = false
  moveLeft = false
  moveRight = false
  moveUp = false
  moveDown = false
  fast = false

  constructor(camera: THREE.Camera, dom: HTMLElement) {
    this.controls = new PointerLockControls(camera, dom)
    this.bindEvents()
  }

  bindEvents() {
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
  }

  onKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case 'KeyW': this.moveForward = true; break
      case 'KeyS': this.moveBackward = true; break
      case 'KeyA': this.moveLeft = true; break
      case 'KeyD': this.moveRight = true; break
      case 'KeyQ': this.moveDown = true; break
      case 'KeyE': this.moveUp = true; break
      case 'ShiftLeft': this.fast = true; break
    }
  }

  onKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case 'KeyW': this.moveForward = false; break
      case 'KeyS': this.moveBackward = false; break
      case 'KeyA': this.moveLeft = false; break
      case 'KeyD': this.moveRight = false; break
      case 'KeyQ': this.moveDown = false; break
      case 'KeyE': this.moveUp = false; break
      case 'ShiftLeft': this.fast = false; break
    }
  }

  update(delta: number) {
    if (!this.controls.isLocked) return

    const speed = this.fast ? 20 : 8
    const distance = speed * delta

    if (this.moveForward) this.controls.moveForward(distance)
    if (this.moveBackward) this.controls.moveForward(-distance)
    if (this.moveRight) this.controls.moveRight(distance)
    if (this.moveLeft) this.controls.moveRight(-distance)

    const obj = this.controls.getObject()
    if (this.moveUp) obj.position.y += distance
    if (this.moveDown) obj.position.y -= distance
  }

  enter() {
    this.controls.lock()
  }

  exit() {
    this.controls.unlock()
  }
}
```

### 14.4 漫游模式注意事项

1. 漫游模式下禁用 TransformControls。
2. 漫游模式下禁用模型拖拽放置。
3. 漫游模式下可以允许点击设备查看信息，但不允许编辑。
4. 漫游速度应该可配置。
5. 进入漫游模式前应提示用户“点击画布进入，Esc 退出”。
6. 如果要实现碰撞，需给玩家相机加 Capsule 或简单包围球。

---

## 15. 类 Blender 视角切换

### 15.1 视角类型

```txt
透视视图 Perspective
顶视图 Top
前视图 Front
右视图 Right
左视图 Left
后视图 Back
第一人称 First Person
```

### 15.2 快捷键建议

```txt
Num1：前视图
Num3：右视图
Num7：顶视图
Num5：正交/透视切换
Home：全部模型居中
F：聚焦选中对象
```

### 15.3 聚焦选中模型

```ts
function focusObject(object: THREE.Object3D, camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  const box = new THREE.Box3().setFromObject(object)
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)

  const maxDim = Math.max(size.x, size.y, size.z)
  const distance = maxDim * 2.5

  camera.position.set(center.x + distance, center.y + distance, center.z + distance)
  controls.target.copy(center)
  controls.update()
}
```

---

## 16. 楼层与图层切换

### 16.1 楼层切换逻辑

楼层切换不是删除模型，而是根据对象 `floorId` 显示/隐藏。

```ts
function applyFloorVisibility(currentFloorId: string | 'all') {
  objectMap.forEach((object3d, objectId) => {
    const sceneObject = sceneStore.getObject(objectId)
    if (!sceneObject) return

    if (currentFloorId === 'all') {
      object3d.visible = sceneObject.visible
    } else {
      object3d.visible = sceneObject.visible && sceneObject.floorId === currentFloorId
    }
  })
}
```

### 16.2 图层切换逻辑

图层可以控制显示、锁定、选择。

```ts
function applyLayerState(layerId: string, visible: boolean, locked: boolean) {
  sceneStore.objects
    .filter(obj => obj.layerId === layerId)
    .forEach(obj => {
      const object3d = objectMap.get(obj.id)
      if (!object3d) return
      object3d.visible = visible
      object3d.userData.locked = locked
    })
}
```

### 16.3 楼层/图层 UI

右侧或顶部提供：

```txt
楼层：全部 | 1F | 2F | 3F | B1
图层：
  [✓] 建筑层  [锁]
  [✓] 设备层  [锁]
  [✓] 管线层  [锁]
  [✓] 标注层  [锁]
```

---

## 17. 网格吸附、地面吸附与对齐

### 17.1 网格吸附

```ts
function snapValue(value: number, step: number) {
  return Math.round(value / step) * step
}

function snapVector3(v: THREE.Vector3, step: number) {
  return new THREE.Vector3(
    snapValue(v.x, step),
    snapValue(v.y, step),
    snapValue(v.z, step)
  )
}
```

### 17.2 地面吸附

模型放置时，通常需要让模型底部贴住地面：

```ts
function placeOnGround(object: THREE.Object3D, groundY = 0) {
  const box = new THREE.Box3().setFromObject(object)
  const offset = groundY - box.min.y
  object.position.y += offset
}
```

### 17.3 表面吸附

第二阶段可以支持把模型贴到墙面或其他模型表面：

```txt
Raycaster 检测所有可吸附表面
→ 取 hit.point 作为位置
→ 取 hit.face.normal 作为法线
→ 根据法线计算模型朝向
→ 放置到该表面
```

---

## 18. 撤销/重做系统

### 18.1 支持的操作类型

```ts
export type HistoryActionType =
  | 'ADD_OBJECT'
  | 'DELETE_OBJECT'
  | 'TRANSFORM_OBJECT'
  | 'UPDATE_OBJECT_PROPS'
  | 'CHANGE_LAYER'
  | 'CHANGE_FLOOR'
  | 'DUPLICATE_OBJECT'
```

### 18.2 历史记录结构

```ts
export interface HistoryAction {
  id: string
  type: HistoryActionType
  label: string
  before?: any
  after?: any
  payload?: any
  timestamp: number
}
```

### 18.3 History Store

```ts
export const useHistoryStore = defineStore('history', () => {
  const undoStack = ref<HistoryAction[]>([])
  const redoStack = ref<HistoryAction[]>([])

  function push(action: HistoryAction) {
    undoStack.value.push(action)
    redoStack.value = []
  }

  function undo() {
    const action = undoStack.value.pop()
    if (!action) return
    applyReverseAction(action)
    redoStack.value.push(action)
  }

  function redo() {
    const action = redoStack.value.pop()
    if (!action) return
    applyAction(action)
    undoStack.value.push(action)
  }

  return { undoStack, redoStack, push, undo, redo }
})
```

### 18.4 撤销/重做原则

1. 操作必须是原子化的。
2. 拖动中不能每帧写历史，只在操作结束时写一次。
3. 删除对象时要保存完整对象数据，以便撤销恢复。
4. 场景加载时不要把所有对象添加写入历史。
5. 自动保存不应该影响历史栈。

---

## 19. 场景保存与恢复

### 19.1 保存流程

```txt
用户点击保存
→ 从 Pinia sceneStore 获取 SceneDocument
→ 同步当前相机状态
→ 生成场景缩略图
→ 调用后端 API 保存
→ 返回 sceneId 和 updatedAt
→ 页面提示保存成功
```

### 19.2 加载流程

```txt
进入编辑页面
→ 根据 sceneId 请求场景 JSON
→ 请求相关 Asset 列表
→ 清空当前 Three.js Scene 中的业务对象
→ 遍历 objects
→ 根据 assetId 加载 GLB
→ 设置 position/rotation/scale
→ 添加到 Scene
→ 恢复相机、楼层、图层、环境
```

### 19.3 场景保存 API 示例

```http
POST /api/scenes
Content-Type: application/json

{
  "name": "无人机装配场景",
  "description": "用于教学展示",
  "sceneJson": { ... },
  "thumbnailUrl": "https://.../cover.png"
}
```

### 19.4 场景更新 API 示例

```http
PUT /api/scenes/{id}
Content-Type: application/json

{
  "name": "无人机装配场景 v2",
  "sceneJson": { ... },
  "thumbnailUrl": "https://.../cover-v2.png"
}
```

### 19.5 截图生成缩略图

```ts
function captureScene(renderer: THREE.WebGLRenderer) {
  return renderer.domElement.toDataURL('image/png')
}
```

如果要上传到后端，需要将 base64 转 Blob：

```ts
function dataURLToBlob(dataUrl: string) {
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new Blob([u8arr], { type: mime })
}
```

---

## 20. 后端数据库设计

### 20.1 模型资源表 asset_model

```sql
CREATE TABLE asset_model (
  id              VARCHAR(64) PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(128),
  category_id     VARCHAR(64),
  category_name   VARCHAR(128),
  description     TEXT,
  tags            JSON,
  glb_url         TEXT NOT NULL,
  thumbnail_url   TEXT,
  preview_url     TEXT,
  file_size       BIGINT,
  file_hash       VARCHAR(128),
  default_scale   JSON,
  default_rotation JSON,
  origin_policy   VARCHAR(64),
  unit            VARCHAR(16),
  triangle_count  INTEGER,
  vertex_count    INTEGER,
  texture_count   INTEGER,
  has_animation   BOOLEAN DEFAULT FALSE,
  has_draco       BOOLEAN DEFAULT FALSE,
  has_meshopt     BOOLEAN DEFAULT FALSE,
  metadata        JSON,
  created_by      VARCHAR(64),
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP,
  deleted         BOOLEAN DEFAULT FALSE
);
```

### 20.2 场景表 scene_document

```sql
CREATE TABLE scene_document (
  id             VARCHAR(64) PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  description    TEXT,
  version        VARCHAR(32),
  scene_json     JSONB,
  thumbnail_url  TEXT,
  metadata       JSONB,
  created_by     VARCHAR(64),
  created_at     TIMESTAMP,
  updated_at     TIMESTAMP,
  deleted        BOOLEAN DEFAULT FALSE
);
```

如果使用 MySQL，`JSONB` 改为 `JSON`。

### 20.3 分类表 asset_category

```sql
CREATE TABLE asset_category (
  id          VARCHAR(64) PRIMARY KEY,
  parent_id   VARCHAR(64),
  name        VARCHAR(128) NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMP,
  updated_at  TIMESTAMP
);
```

### 20.4 操作日志表 scene_operation_log

```sql
CREATE TABLE scene_operation_log (
  id          VARCHAR(64) PRIMARY KEY,
  scene_id    VARCHAR(64),
  user_id     VARCHAR(64),
  action_type VARCHAR(64),
  action_data JSONB,
  created_at  TIMESTAMP
);
```

---

## 21. 后端接口设计

### 21.1 模型资源接口

```txt
GET    /api/assets                 查询模型资源列表
GET    /api/assets/{id}            查询模型详情
POST   /api/assets                 新增模型资源
PUT    /api/assets/{id}            更新模型资源
DELETE /api/assets/{id}            删除模型资源
POST   /api/assets/upload          上传 GLB 文件
POST   /api/assets/{id}/thumbnail  上传/生成缩略图
GET    /api/assets/categories      查询分类树
```

### 21.2 场景接口

```txt
GET    /api/scenes                 查询场景列表
GET    /api/scenes/{id}            查询场景详情
POST   /api/scenes                 新建场景
PUT    /api/scenes/{id}            更新场景
DELETE /api/scenes/{id}            删除场景
POST   /api/scenes/{id}/duplicate  复制场景
POST   /api/scenes/{id}/publish    发布场景
GET    /api/scenes/{id}/preview    获取只读预览数据
```

### 21.3 文件上传接口

```txt
POST /api/files/upload
```

返回：

```json
{
  "url": "https://example.com/models/xxx.glb",
  "fileName": "xxx.glb",
  "fileSize": 1024000,
  "fileHash": "sha256..."
}
```

---

## 22. Pinia Store 设计

### 22.1 scene.store.ts

```ts
export const useSceneStore = defineStore('scene', () => {
  const sceneId = ref<string>('')
  const name = ref<string>('未命名场景')
  const objects = ref<SceneObject[]>([])
  const floors = ref<SceneFloor[]>([])
  const layers = ref<SceneLayer[]>([])

  function addObject(obj: SceneObject) {
    objects.value.push(obj)
  }

  function removeObject(id: string) {
    objects.value = objects.value.filter(item => item.id !== id)
  }

  function getObject(id: string) {
    return objects.value.find(item => item.id === id)
  }

  function updateObject(id: string, patch: Partial<SceneObject>) {
    const obj = getObject(id)
    if (!obj) return
    Object.assign(obj, patch)
  }

  function updateTransform(id: string, transform: {
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number]
  }) {
    updateObject(id, transform)
  }

  function toSceneDocument(): SceneDocument {
    return {
      id: sceneId.value,
      name: name.value,
      version: '1.0.0',
      camera: editorStore.getCameraState(),
      environment: editorStore.environment,
      grid: editorStore.grid,
      floors: floors.value,
      layers: layers.value,
      objects: objects.value
    }
  }

  return {
    sceneId,
    name,
    objects,
    floors,
    layers,
    addObject,
    removeObject,
    getObject,
    updateObject,
    updateTransform,
    toSceneDocument
  }
})
```

### 22.2 editor.store.ts

```ts
export const useEditorStore = defineStore('editor', () => {
  const mode = ref<'edit' | 'first-person' | 'preview'>('edit')
  const transformMode = ref<'translate' | 'rotate' | 'scale'>('translate')
  const selectedObjectId = ref<string | null>(null)
  const currentFloorId = ref<string | 'all'>('all')
  const currentLayerId = ref<string>('layer_default')

  const snapEnabled = ref(true)
  const snapSize = ref(0.5)

  function selectObject(id: string | null) {
    selectedObjectId.value = id
  }

  function setTransformMode(next: 'translate' | 'rotate' | 'scale') {
    transformMode.value = next
  }

  function setMode(next: 'edit' | 'first-person' | 'preview') {
    mode.value = next
  }

  return {
    mode,
    transformMode,
    selectedObjectId,
    currentFloorId,
    currentLayerId,
    snapEnabled,
    snapSize,
    selectObject,
    setTransformMode,
    setMode
  }
})
```

---

## 23. 右侧属性面板设计

### 23.1 属性面板内容

选中模型后，右侧显示：

```txt
基础信息
  名称
  类型
  资源 ID
  实例 ID
  是否可见
  是否锁定

变换属性
  位置 X/Y/Z
  旋转 X/Y/Z
  缩放 X/Y/Z

归属信息
  楼层
  图层
  父级分组

渲染属性
  投射阴影
  接收阴影
  透明度

业务属性
  设备编号
  设备类型
  备注
  自定义 JSON
```

### 23.2 属性面板更新模型

右侧输入框修改位置时，需要同步：

```txt
输入框值变化
→ 更新 sceneStore
→ 找到对应 object3d
→ 设置 object3d.position/rotation/scale
→ TransformControls 自动跟随
→ 写入历史记录
```

### 23.3 防抖处理

位置、旋转、缩放输入框可能频繁触发，建议：

1. 输入时实时更新 Three.js 对象。
2. blur 或 enter 时写入历史记录。
3. 或使用 300ms debounce。

---

## 24. 快捷键系统

### 24.1 快捷键表

| 快捷键 | 功能 |
|---|---|
| W | 移动模式 |
| E | 旋转模式 |
| R | 缩放模式 |
| Delete | 删除选中对象 |
| Esc | 取消选中 / 退出漫游 |
| Ctrl+Z | 撤销 |
| Ctrl+Y | 重做 |
| Ctrl+C | 复制对象 |
| Ctrl+V | 粘贴对象 |
| Ctrl+D | 复制并偏移 |
| F | 聚焦选中对象 |
| Home | 显示全部对象 |
| G | 开启自由移动，可选 |
| Shift | 精细/快速控制，根据模式决定 |
| Tab | 编辑/漫游模式切换 |
| Num1 | 前视图 |
| Num3 | 右视图 |
| Num7 | 顶视图 |

### 24.2 快捷键注意事项

1. 当焦点在输入框、文本域、下拉框中时，不应触发全局快捷键。
2. 漫游模式和编辑模式快捷键要分开处理。
3. Delete 删除前，如果对象未保存或多选，应二次确认。
4. Ctrl+S 可以保存场景，但要阻止浏览器默认保存网页行为。

```ts
function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement
  if (!el) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable
}
```

---

## 25. 模型资源规范

### 25.1 GLB 制作规范

所有模型资源进入平台前，应尽量满足：

1. 格式为 `.glb`，优先不用分散的 `.gltf + bin + textures`。
2. 模型原点尽量在底部中心。
3. 单位统一为米。
4. 朝向统一，默认正面朝向 `+Z` 或按项目约定。
5. 不要包含无用相机、灯光、隐藏对象。
6. 贴图尺寸建议不超过 2048×2048，普通模型优先 1024×1024。
7. 单个模型面数控制在合理范围内，普通设备建议小于 5 万三角面。
8. 大型建筑模型需要拆分或使用 LOD。
9. 模型文件建议压缩，尽量控制在 1MB~20MB。
10. 模型命名清晰，例如 `drone_motor_v1.glb`。

### 25.2 模型优化工具

推荐使用：

```txt
Blender
RapidCompact
gltf-transform
gltf-pipeline
KTX-Software
Draco encoder
Meshoptimizer
```

### 25.3 glTF-Transform 示例

```bash
gltf-transform inspect input.glb

gltf-transform optimize input.glb output.glb \
  --compress draco \
  --texture-compress webp \
  --simplify false
```

Meshopt 示例：

```bash
gltf-transform meshopt input.glb output.glb --level medium
```

### 25.4 资源入库检查

上传 GLB 后，后端或前端应检查：

```txt
文件扩展名是否为 .glb/.gltf
文件大小是否超限
是否能被 GLTFLoader 加载
是否存在场景节点
是否存在明显超大贴图
是否需要生成缩略图
是否需要统计面数和顶点数
```

---

## 26. 性能优化规范

### 26.1 渲染性能目标

| 场景规模 | 目标帧率 |
|---|---|
| 50 个模型以内 | 55-60 FPS |
| 200 个模型以内 | 30-60 FPS |
| 500 个模型以内 | 25-45 FPS，需要优化 |
| 1000 个模型以上 | 必须使用实例化、LOD、分层加载 |

### 26.2 前端性能优化措施

1. 控制 renderer pixelRatio，最大不超过 2。
2. 模型缓存，避免重复加载。
3. 视锥裁剪默认启用。
4. 大量重复模型使用 `InstancedMesh`。
5. 大模型使用 LOD。
6. 远距离模型降低材质和阴影质量。
7. 只在需要时启用阴影。
8. 不要每帧深度遍历全场景。
9. 属性面板不要每帧响应 Three.js 对象变化。
10. 操作历史不要每帧写入。
11. 使用 requestAnimationFrame 控制渲染循环。
12. 非编辑状态可以按需渲染，减少 GPU 占用。
13. 释放删除模型的几何体、材质和贴图资源。

### 26.3 资源释放

```ts
function disposeObject(object: THREE.Object3D) {
  object.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose()

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(disposeMaterial)
      } else {
        disposeMaterial(child.material)
      }
    }
  })
}

function disposeMaterial(material: THREE.Material & Record<string, any>) {
  for (const key in material) {
    const value = material[key]
    if (value && value.isTexture) {
      value.dispose()
    }
  }
  material.dispose()
}
```

### 26.4 何时不应释放资源

如果 GLB 模型被缓存复用，不要因为删除某个实例就释放缓存中的共享资源。需要区分：

```txt
删除场景实例：从 scene 移除 object3d
清空模型缓存：释放缓存模型资源
退出编辑器：统一释放 renderer、controls、场景对象、缓存
```

---

## 27. 交互体验设计

### 27.1 拖拽体验

拖拽时应该：

1. 鼠标光标变成复制状态。
2. 3D 场景中显示半透明预览模型。
3. 预览模型跟随鼠标落点移动。
4. 无法放置区域显示红色提示。
5. 可放置区域显示绿色或正常提示。
6. 松开鼠标后正式创建模型。

### 27.2 选中体验

选中模型后应该：

1. 模型有描边或包围盒。
2. TransformControls 显示在模型原点。
3. 右侧属性面板刷新。
4. 底部状态栏显示对象名称、坐标。
5. 左侧模型库不应被选中状态干扰。

### 27.3 保存体验

保存时应该：

1. 显示保存中状态。
2. 禁止重复点击保存。
3. 保存成功显示时间。
4. 保存失败显示错误原因。
5. 离开页面前如有未保存更改，应提示。

---

## 28. 安全与权限

### 28.1 文件上传安全

1. 只允许 `.glb`、`.gltf`、图片等白名单格式。
2. 限制文件大小。
3. 后端重新生成文件名，不使用用户上传原始文件名作为存储路径。
4. 检查 MIME Type，但不能只依赖 MIME Type。
5. 资源访问应支持鉴权或签名 URL。
6. 禁止上传可执行脚本。

### 28.2 用户权限

建议角色：

| 角色 | 权限 |
|---|---|
| 管理员 | 全部资源、全部场景、用户管理 |
| 编辑者 | 上传模型、创建和编辑场景 |
| 查看者 | 只能查看已发布场景 |
| 访客 | 只能访问公开预览链接 |

### 28.3 场景权限

场景应支持：

```txt
私有
团队可见
公开只读
公开可复制
```

---

## 29. 测试方案

### 29.1 单元测试

重点测试：

1. 场景 JSON 序列化和反序列化。
2. Transform 数据转换。
3. snap 计算。
4. history undo/redo。
5. asset 与 sceneObject 映射。
6. 楼层/图层过滤逻辑。

### 29.2 交互测试

必须手动测试：

1. 从左侧拖动 GLB 到场景。
2. 同一个模型重复放置多个实例。
3. 点击选中模型。
4. W/E/R 切换模式。
5. 拖动三轴移动模型。
6. 旋转模型。
7. 缩放模型。
8. Delete 删除模型。
9. Ctrl+Z 撤销。
10. Ctrl+Y 重做。
11. 保存场景。
12. 刷新页面后加载场景。
13. 进入第一人称漫游。
14. Esc 退出漫游。
15. 楼层切换后模型正确显示/隐藏。

### 29.3 性能测试

测试指标：

```txt
首屏加载时间
GLB 加载时间
场景保存时间
场景恢复时间
平均 FPS
显存占用
内存占用
模型数量达到 100/200/500 时的交互流畅度
```

### 29.4 兼容性测试

建议测试浏览器：

```txt
Chrome 最新版
Edge 最新版
Firefox 最新版
```

暂不建议第一版支持移动端复杂编辑；移动端可以先支持只读预览。

---

## 30. 开发阶段规划

### 30.1 第 1 阶段：基础编辑器骨架

目标：打开页面后能看到 Three.js 场景。

任务：

1. 创建 Vue3 + Vite + TypeScript 项目。
2. 安装 Three.js、Pinia、Element Plus。
3. 创建 SceneEditorView。
4. 创建 ThreeCanvas 组件。
5. 初始化 Scene、Camera、Renderer。
6. 添加 GridHelper、AxesHelper、灯光。
7. 支持 OrbitControls。
8. 支持窗口 resize。

验收：

```txt
页面可以看到 3D 网格
可以鼠标旋转、缩放、平移视角
窗口大小变化时画布正常适配
```

### 30.2 第 2 阶段：GLB 加载与模型库

目标：左侧模型库可以显示模型，点击后能加载到场景。

任务：

1. 设计 AssetItem 数据。
2. 创建 asset.store.ts。
3. 创建 AssetPanel 和 AssetCard。
4. 实现 ModelLoader。
5. 加载本地 public/models 下的 GLB。
6. 点击卡片添加模型到场景中心。
7. 支持模型缓存和克隆。

验收：

```txt
左侧模型列表正常显示
点击模型后可出现在 3D 场景中
重复点击可生成多个实例
```

### 30.3 第 3 阶段：拖拽放置

目标：从左侧拖动模型到 3D 场景指定位置。

任务：

1. AssetCard 支持 draggable。
2. ThreeCanvas 支持 dragover/drop。
3. 创建不可见 groundPlane。
4. 实现 Raycaster 落点计算。
5. Drop 时创建 SceneObject。
6. 模型添加到落点位置。
7. 增加拖拽预览模型。

验收：

```txt
模型可以从左侧拖入画布
模型出现在鼠标松开位置
坐标与地面落点基本一致
```

### 30.4 第 4 阶段：选中与 TransformControls

目标：可以像 Blender 一样调整模型。

任务：

1. 实现点击选中。
2. 实现 objectMap 管理。
3. 初始化 TransformControls。
4. 选中对象 attach。
5. W/E/R 切换移动/旋转/缩放。
6. 变换后同步到 Store。
7. 右侧属性面板显示变换数据。

验收：

```txt
点击模型后出现三轴控件
W/E/R 可切换模式
移动/旋转/缩放后属性面板数据同步变化
```

### 30.5 第 5 阶段：场景保存与恢复

目标：编辑的场景可以保存并重新加载。

任务：

1. 完成 SceneDocument 数据结构。
2. 实现 sceneStore.toSceneDocument。
3. 实现 JSON 导出。
4. 实现 JSON 导入。
5. 实现后端保存接口。
6. 实现场景加载接口。
7. 恢复相机、楼层、图层、对象。

验收：

```txt
保存后刷新页面不丢失
模型位置/旋转/缩放完全恢复
场景 JSON 可下载和上传
```

### 30.6 第 6 阶段：第一人称漫游

目标：支持游戏式场景查看。

任务：

1. 引入 PointerLockControls。
2. 创建 FirstPersonController。
3. 实现 WASD 移动。
4. 实现鼠标控制视角。
5. 编辑模式/漫游模式切换。
6. 漫游模式下禁用 TransformControls。
7. Esc 退出漫游。

验收：

```txt
点击漫游按钮后进入第一人称模式
WASD 可以移动
鼠标可以转动视角
Esc 可以退出
```

### 30.7 第 7 阶段：撤销、重做、删除、复制

目标：编辑器具备基本生产可用性。

任务：

1. 创建 history.store.ts。
2. 添加对象写入历史。
3. 删除对象写入历史。
4. Transform 操作完成后写入历史。
5. Ctrl+Z 撤销。
6. Ctrl+Y 重做。
7. Ctrl+C / Ctrl+V 复制粘贴。

验收：

```txt
添加、删除、移动、旋转、缩放均可撤销重做
复制粘贴对象位置合理偏移
```

### 30.8 第 8 阶段：楼层、图层、吸附

目标：提升复杂场景编辑能力。

任务：

1. 创建 FloorSwitcher。
2. 创建 LayerPanel。
3. 对象支持 floorId/layerId。
4. 楼层切换显示隐藏。
5. 图层显示、锁定。
6. 网格吸附。
7. 地面吸附。

验收：

```txt
可按楼层切换对象显示
图层锁定后对象不可选择
开启吸附后模型按网格移动
```

---

## 31. AI 编程 Agent 执行规则

如果由 AI 编程助手根据本技能文档开发，必须遵守以下规则：

1. 不要一次性生成巨大不可维护的单文件代码。
2. 必须按照模块拆分：Engine、Loader、Controller、Store、Components、API。
3. 每完成一个阶段，必须保证项目可以运行。
4. 每个新增模块必须有清晰职责。
5. 所有 TypeScript 类型必须放在 `types` 目录或模块同级。
6. Three.js 对象不能直接塞进 Pinia Store 中。
7. Pinia 只保存可序列化数据。
8. 任何需要销毁的 Three.js 资源必须提供 dispose 方法。
9. 不要把资源 URL 写死在业务逻辑里，应通过 Asset 数据传入。
10. 快捷键必须判断当前焦点是否在输入框中。
11. 编辑模式和漫游模式必须互斥。
12. TransformControls 拖动时必须临时禁用 OrbitControls。
13. 模型加载必须加缓存。
14. 场景保存必须保存资源 ID，不保存 Three.js 对象。
15. 所有核心交互必须考虑异常情况：模型加载失败、落点为空、对象锁定、图层隐藏、资源不存在。

---

## 32. 建议的 AI 开发提示词

### 32.1 初始化项目提示词

```txt
请基于 Vue 3 + Vite + TypeScript + Three.js + Pinia 创建一个 Web3D 场景编辑器项目。
要求：
1. 使用模块化结构。
2. 创建 SceneEditorView 页面。
3. 创建 ThreeCanvas 组件。
4. 初始化 Three.js Scene、PerspectiveCamera、WebGLRenderer、GridHelper、灯光、OrbitControls。
5. 支持窗口 resize。
6. 不要写成单文件大代码。
7. 所有 Three.js 初始化逻辑封装到 three/core/ThreeEngine.ts。
```

### 32.2 GLB 加载提示词

```txt
请为当前 Web3D 场景编辑器增加 GLB 模型加载功能。
要求：
1. 创建 AssetItem 类型。
2. 创建 asset.store.ts，提供模型资源列表。
3. 创建 ModelLoader.ts，封装 GLTFLoader、DRACOLoader、MeshoptDecoder。
4. 支持模型缓存，同一个 assetId 不重复请求。
5. 支持克隆模型实例。
6. 点击左侧 AssetCard 后，把模型添加到场景中心。
7. 添加 objectMap，建立 sceneObjectId 到 THREE.Object3D 的映射。
```

### 32.3 拖拽放置提示词

```txt
请为 Web3D 场景编辑器增加从左侧模型库拖拽 GLB 到 3D 场景的功能。
要求：
1. AssetCard 支持 HTML draggable。
2. dragstart 写入 application/x-asset-id。
3. ThreeCanvas 监听 dragover 和 drop。
4. 在 Three.js 场景中创建不可见 groundPlane。
5. 使用 Raycaster 计算鼠标在地面上的落点。
6. drop 时创建 SceneObject 数据，并加载对应 GLB 模型放置到落点。
7. 支持网格吸附配置。
8. 代码必须拆分到 PlacementController.ts。
```

### 32.4 TransformControls 提示词

```txt
请为 Web3D 场景编辑器增加模型选中和 TransformControls 操作功能。
要求：
1. 使用 Raycaster 点击选中模型。
2. 通过 userData.sceneObjectId 找到场景实例。
3. 选中后 TransformControls attach 到对象根节点。
4. W/E/R 分别切换 translate/rotate/scale。
5. TransformControls 拖动时禁用 OrbitControls。
6. objectChange 时同步 position/rotation/scale 到 sceneStore。
7. mouseDown 记录变换前状态，mouseUp 写入 historyStore。
8. 右侧 InspectorPanel 显示并可编辑位置、旋转、缩放。
```

### 32.5 第一人称漫游提示词

```txt
请为 Web3D 场景编辑器增加第一人称漫游模式。
要求：
1. 使用 PointerLockControls。
2. 创建 FirstPersonController.ts。
3. WASD 控制前后左右，Q/E 控制下降/上升，Shift 加速。
4. 鼠标移动控制视角。
5. 漫游模式下禁用 TransformControls 和拖拽放置。
6. 编辑模式和漫游模式可以通过顶部按钮切换。
7. Esc 退出鼠标锁定。
8. 状态栏显示当前模式。
```

### 32.6 保存加载提示词

```txt
请为 Web3D 场景编辑器增加场景保存与恢复功能。
要求：
1. 创建 SceneDocument、SceneObject、SceneCameraState 类型。
2. sceneStore 中只保存可序列化数据。
3. 保存时导出 JSON，包括 camera、environment、grid、floors、layers、objects。
4. 加载时根据 objects 中的 assetId 加载 GLB 并恢复 position/rotation/scale。
5. 支持导出 JSON 文件和从 JSON 文件导入。
6. 预留后端 REST API：GET/POST/PUT /api/scenes。
```

---

## 33. 关键边界情况处理

### 33.1 GLB 加载失败

处理方式：

```txt
显示错误提示
删除已创建但未加载成功的 SceneObject
记录错误日志
允许用户重试
```

### 33.2 拖拽落点为空

可能原因：

```txt
鼠标不在 Canvas 内
Raycaster 没有打到 groundPlane
相机参数异常
地面被隐藏或未添加
```

处理方式：

```txt
不创建对象
显示无法放置提示
```

### 33.3 对象被锁定

锁定对象应：

```txt
不可选择
不可移动
不可删除，或删除前提示
右侧面板只读
```

### 33.4 图层隐藏

隐藏图层中的对象：

```txt
不显示
不可选择
不参与 TransformControls
一般不参与 Raycaster 选择
```

### 33.5 模型尺寸异常

如果模型过大或过小，应：

```txt
上传时提示尺寸异常
入库时提供默认缩放
加载时按 defaultScale 修正
右侧属性面板允许调整
```

---

## 34. UI 细节规范

### 34.1 顶部工具栏

按钮建议：

```txt
新建
打开
保存
另存为
撤销
重做
选择
移动
旋转
缩放
吸附开关
编辑模式
漫游模式
导出 JSON
帮助
```

### 34.2 状态栏

显示：

```txt
当前模式：编辑/漫游
当前工具：移动/旋转/缩放
选中对象：对象名称
坐标：X/Y/Z
模型数量：N
FPS：N
保存状态：已保存/未保存/保存中
```

### 34.3 空状态

没有模型时显示：

```txt
请从左侧模型库拖动 GLB 模型到场景中
```

没有选中对象时右侧显示：

```txt
未选中对象
点击场景中的模型可编辑属性
```

---

## 35. 代码质量规范

### 35.1 TypeScript 规范

1. 禁止大面积使用 `any`。
2. Three.js 与业务类型要明确区分。
3. 所有 API 返回值要有类型。
4. Store 的状态必须可序列化。
5. 工具函数要有输入输出类型。

### 35.2 Vue 组件规范

1. 使用 `<script setup lang="ts">`。
2. 大组件拆小组件。
3. 组件只处理 UI，不直接做复杂 Three.js 逻辑。
4. Three.js 逻辑放到 `three/` 目录。
5. 业务状态放到 Store。

### 35.3 Three.js 规范

1. 所有添加到场景的业务对象必须有 `userData.sceneObjectId`。
2. 内部辅助对象命名以 `__` 开头，例如 `__grid__`、`__ground_plane__`。
3. 删除对象要从 `objectMap` 同步移除。
4. 不要在渲染循环里做重型计算。
5. 对象销毁时注意释放 geometry、material、texture。

---

## 36. 验收标准

### 36.1 MVP 验收标准

MVP 完成时必须满足：

```txt
1. 页面布局包含顶部工具栏、左侧模型库、中间 3D 画布、右侧属性面板、底部状态栏。
2. 左侧模型库可以显示至少 3 个 GLB 模型。
3. 鼠标悬浮模型卡片可以看到简介。
4. 模型可以拖入 3D 场景。
5. 模型可以被点击选中。
6. 选中模型后可以移动、旋转、缩放。
7. W/E/R 快捷键可用。
8. Delete 可以删除选中模型。
9. 场景可以导出 JSON。
10. JSON 可以重新导入并恢复场景。
11. 可以切换第一人称漫游模式。
12. WASD + 鼠标可以漫游。
13. 编辑模式和漫游模式互不冲突。
14. 刷新页面后加载保存的场景，模型位置不丢失。
```

### 36.2 生产可用验收标准

```txt
1. 支持模型上传与入库。
2. 支持模型分类、搜索、缩略图。
3. 支持场景保存到后端。
4. 支持场景列表、编辑、复制、删除。
5. 支持撤销/重做。
6. 支持楼层与图层管理。
7. 支持网格吸附。
8. 200 个普通模型以内编辑基本流畅。
9. GLB 加载失败有明确提示。
10. 用户离开页面前有未保存提示。
11. 权限控制基本可用。
12. 接口错误有统一处理。
```

---

## 37. 常见问题与解决方案

### 37.1 模型拖入后位置不准

可能原因：

1. Canvas 坐标没有扣除 DOM 偏移。
2. Raycaster NDC 计算错误。
3. groundPlane 旋转错误。
4. 相机未更新矩阵。

解决：

```ts
const rect = dom.getBoundingClientRect()
mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
```

### 37.2 TransformControls 和 OrbitControls 冲突

解决：

```ts
transformControls.addEventListener('dragging-changed', e => {
  orbitControls.enabled = !e.value
})
```

### 37.3 模型太暗或颜色不对

解决：

1. 检查灯光。
2. 设置 renderer.outputColorSpace。
3. 设置贴图 colorSpace。
4. 检查模型材质。

```ts
renderer.outputColorSpace = THREE.SRGBColorSpace
texture.colorSpace = THREE.SRGBColorSpace
```

### 37.4 GLB 加载跨域失败

解决：

1. 资源服务器配置 CORS。
2. GLB URL 使用同源代理。
3. 使用后端文件流转发。

### 37.5 页面越来越卡

可能原因：

1. 删除对象没有 dispose。
2. 模型重复加载没有缓存。
3. 每帧写 Store。
4. 每帧遍历场景。
5. 阴影过多。

解决：

1. 做模型缓存。
2. 删除对象时释放资源。
3. Store 同步节流。
4. 关闭非必要阴影。
5. 控制模型面数和贴图大小。

---

## 38. 最小可运行 MVP 清单

开发时可以按下面清单逐项完成：

```txt
[ ] 创建 Vue3 + Vite + TypeScript 项目
[ ] 安装 three、pinia、element-plus
[ ] 完成主页面布局
[ ] 完成 ThreeCanvas 初始化
[ ] 添加 Scene、Camera、Renderer、Grid、Light
[ ] 添加 OrbitControls
[ ] 创建 AssetItem 类型
[ ] 创建左侧 AssetPanel
[ ] 准备 public/models 示例 GLB
[ ] 创建 ModelLoader
[ ] 点击模型卡片添加到场景
[ ] 实现 HTML 拖拽
[ ] 创建 groundPlane
[ ] 实现 Raycaster 落点
[ ] Drop 时创建模型实例
[ ] 实现 objectMap
[ ] 点击模型选中
[ ] 添加 TransformControls
[ ] W/E/R 切换变换模式
[ ] 右侧属性面板显示变换数据
[ ] Delete 删除模型
[ ] 导出场景 JSON
[ ] 导入场景 JSON
[ ] 添加 PointerLockControls
[ ] 实现第一人称 WASD 漫游
[ ] 编辑/漫游模式切换
[ ] 基础测试通过
```

---

## 39. 推荐第一版交付物

第一版建议交付：

```txt
1. 前端项目源码
2. 后端接口源码，或 Mock API
3. 3-5 个示例 GLB 模型
4. 示例场景 JSON
5. 模型资源管理页面
6. 场景编辑页面
7. 场景预览页面
8. 使用说明文档
9. 部署说明文档
10. 演示视频或 GIF
```

---

## 40. 部署建议

### 40.1 前端部署

```bash
npm install
npm run build
npm run preview -- --host 0.0.0.0
```

生产环境建议：

```txt
Nginx
Docker
CDN
HTTPS
```

### 40.2 Nginx 配置示例

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/web3d-scene-editor/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /models/ {
        add_header Access-Control-Allow-Origin *;
        alias /data/models/;
    }
}
```

---

## 41. 最终结论

该平台完全具备技术可行性，建议采用：

```txt
Vue3 + Vite + TypeScript + Three.js + Pinia
```

核心实现路线：

```txt
模型资源库
→ GLB 加载与缓存
→ HTML 拖拽到 Canvas
→ Raycaster 计算落点
→ 创建 SceneObject
→ TransformControls 编辑模型
→ PointerLockControls 第一人称漫游
→ SceneDocument JSON 保存与恢复
→ 后端模型/场景管理
```

第一版不要追求过多高级功能，优先跑通“模型拖入、编辑、保存、恢复、漫游”这条主流程。等主流程稳定后，再增加撤销/重做、吸附、楼层、图层、碰撞、动画和数字孪生数据绑定。

---

## 42. 官方资料参考

开发时建议优先查阅以下官方或主流资料：

1. Three.js 官方文档：GLTFLoader、Raycaster、DragControls、TransformControls、PointerLockControls。
2. Vue 官方文档：Vue 3 Composition API。
3. Pinia 官方文档：Store 状态管理。
4. Khronos glTF 官方说明：glTF 2.0 与 GLB 资产格式。
5. glTF-Transform 文档：模型检查、压缩、优化。
6. MinIO 官方文档：对象存储。
7. Spring Boot / NestJS 官方文档：后端接口。

