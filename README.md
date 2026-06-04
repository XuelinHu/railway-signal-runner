# Railway Signal Runner

基于 Vue 3、CesiumJS、Three.js 和 GLTFLoader 的第一人称铁道信号巡视小游戏。

## 功能

- 第一人称视角移动、鼠标视角控制、移动端方向控制
- 复用 `railway_sign` 中的铁路、车站、桥梁、信号机、机车和人物 GLB 模型
- 铁路沿线信号机巡视目标、计时、速度、里程和完成度 HUD
- CesiumJS 小地图同步显示玩家位置和线路点位
- 本地音效开关、重置、地图显示切换

## 运行

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:4177/
```

## 构建

```bash
npm run build
npm run preview
```

## 资源

模型资源位于 `public/assets/models`，来自当前工作区的 `railway_sign/public/assets/models`。
