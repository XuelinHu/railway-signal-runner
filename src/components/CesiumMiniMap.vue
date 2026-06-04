<template>
  <aside class="cesium-map-shell">
    <div class="map-header">
      <span>GIS 小地图</span>
      <strong>{{ player.phase }}</strong>
    </div>
    <div ref="containerRef" class="cesium-map"></div>
  </aside>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { BASE_GEO, STATION_POINT, getRouteGeoPath, worldToGeo } from '../game/railwayGame'

const props = defineProps({
  player: {
    type: Object,
    required: true
  },
  signals: {
    type: Array,
    required: true
  }
})

const containerRef = ref(null)
let viewer
let playerEntity
let signalEntities = new Map()

onMounted(async () => {
  viewer = new Cesium.Viewer(containerRef.value, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    sceneModePicker: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayer: false,
    imageryProvider: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    requestRenderMode: true,
    maximumRenderTimeChange: 0.5,
    contextOptions: {
      requestWebgl1: true,
      webgl: {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: false
      }
    }
  })

  viewer.scene.globe.enableLighting = false
  viewer.scene.fog.enabled = false
  viewer.scene.skyAtmosphere.show = false
  viewer.scene.useDepthPicking = false
  viewer.scene.pickTranslucentDepth = false
  viewer.scene.screenSpaceCameraController.enableTilt = false
  viewer.scene.screenSpaceCameraController.enableRotate = false
  viewer.imageryLayers.removeAll()

  try {
    const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
    )
    viewer.imageryLayers.addImageryProvider(provider)
  } catch {
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#27313a')
  }

  addRoute()
  updateSignalEntities()
  updatePlayerEntity()

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(BASE_GEO.lon, BASE_GEO.lat, 18000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0
    }
  })
})

onBeforeUnmount(() => {
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
})

watch(() => props.player.position, updatePlayerEntity, { deep: true })
watch(() => props.player.phase, updatePlayerEntity)
watch(() => props.signals.map((signal) => `${signal.id}:${signal.inspected}`).join('|'), updateSignalEntities)

function addRoute() {
  const path = getRouteGeoPath()
  const stationGeo = worldToGeo(STATION_POINT.x, STATION_POINT.z)
  viewer.entities.add({
    name: '巡视线路',
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray(path.flatMap((point) => [point.lon, point.lat])),
      width: 4,
      material: Cesium.Color.fromCssColorString('#f0c94d')
    }
  })
  viewer.entities.add({
    name: STATION_POINT.label,
    position: Cesium.Cartesian3.fromDegrees(stationGeo.lon, stationGeo.lat),
    point: {
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString('#f0c94d'),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2
    }
  })
}

function updatePlayerEntity() {
  if (!viewer || viewer.isDestroyed() || !props.player.geo) return
  const position = Cesium.Cartesian3.fromDegrees(props.player.geo.lon, props.player.geo.lat)

  if (!playerEntity) {
    playerEntity = viewer.entities.add({
      name: '当前位置',
      position,
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#61d9ff'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2
      }
    })
    return
  }

  playerEntity.position = position
}

function updateSignalEntities() {
  if (!viewer || viewer.isDestroyed()) return

  props.signals.forEach((signal) => {
    const color = signal.inspected ? '#61d9ff' : signal.state === 'red' ? '#ff4d45' : signal.state === 'yellow' ? '#ffc84d' : '#35d66b'
    const position = Cesium.Cartesian3.fromDegrees(signal.geo.lon, signal.geo.lat)
    const existing = signalEntities.get(signal.id)

    if (existing) {
      existing.position = position
      existing.point.color = Cesium.Color.fromCssColorString(color)
      return
    }

    const entity = viewer.entities.add({
      name: signal.label,
      position,
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5
      }
    })
    signalEntities.set(signal.id, entity)
  })
}
</script>
