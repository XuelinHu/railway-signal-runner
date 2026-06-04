import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneModel } from 'three/examples/jsm/utils/SkeletonUtils.js'

const CAMERA_HEIGHT = 3.6
const WORLD_LIMITS = {
  minX: -145,
  maxX: 145,
  minZ: -115,
  maxZ: 115
}

export const BASE_GEO = {
  lon: 109.38871,
  lat: 24.30755
}

const DEGREE_PER_UNIT = 0.000018
const ROUTE_ANGLE = Math.atan2(0.75, 1)
const INITIAL_YAW = Math.atan2(-1, -0.75)

const MODEL_URLS = {
  railway: '/assets/models/railway.glb',
  sign: '/assets/models/sign.glb',
  locomotive: '/assets/models/locomotive.glb',
  station: '/assets/models/station.glb',
  bridge: '/assets/models/bridge.glb',
  worker: '/assets/models/work_man.glb',
  man: '/assets/models/man.glb',
  box: '/assets/models/box.glb'
}

const routePoints = [
  new THREE.Vector3(-120, 0.2, -90),
  new THREE.Vector3(-90, 0.2, -67),
  new THREE.Vector3(-58, 0.2, -43),
  new THREE.Vector3(-26, 0.2, -19),
  new THREE.Vector3(8, 0.2, 6),
  new THREE.Vector3(42, 0.2, 31),
  new THREE.Vector3(76, 0.2, 56),
  new THREE.Vector3(112, 0.2, 83)
]

export const SIGNAL_POINTS = [
  { id: 'S-01', label: '进站信号机', state: 'red', x: -80, z: -60 },
  { id: 'S-02', label: '道岔信号机', state: 'green', x: -42, z: -31 },
  { id: 'S-03', label: '桥前预告', state: 'yellow', x: -5, z: -3 },
  { id: 'S-04', label: '区间闭塞', state: 'green', x: 35, z: 26 },
  { id: 'S-05', label: '站场出发', state: 'red', x: 74, z: 56 }
]

export const STATION_POINT = {
  id: 'STATION',
  label: '终点站台',
  x: 108,
  z: 82
}

export function worldToGeo(x, z) {
  return {
    lon: BASE_GEO.lon + x * DEGREE_PER_UNIT,
    lat: BASE_GEO.lat + z * DEGREE_PER_UNIT
  }
}

export function getRouteGeoPath() {
  return routePoints.map((point) => worldToGeo(point.x, point.z))
}

export function createRailwayGame({ canvas, host, onState, onSignals, onEvent }) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(67, 1, 0.1, 1200)
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  })
  const loader = new GLTFLoader()
  const clock = new THREE.Clock()
  const models = new Map()
  const mixers = []
  const keys = new Map()
  const signalRuntime = new Map()
  const trainCurve = new THREE.CatmullRomCurve3(routePoints, false, 'catmullrom', 0.25)

  let animationFrame = 0
  let resizeObserver
  let train = null
  let trainProgress = 0
  let yaw = INITIAL_YAW
  let pitch = -0.06
  let running = false
  let pointerLocked = false
  let completed = false
  let ready = false
  let audioEnabled = false
  let lastStateEmit = 0
  let lastWarningAt = 0
  let elapsed = 0
  let distanceTravelled = 0
  let health = 100
  let lastPosition = new THREE.Vector3(-116, CAMERA_HEIGHT, -87)
  let dragLook = null
  let runStartedAt = 0

  const state = {
    ready: false,
    running: false,
    locked: false,
    loading: '初始化场景',
    elapsed: 0,
    speed: 0,
    distance: 0,
    health: 100,
    inspected: 0,
    total: SIGNAL_POINTS.length,
    completed: false,
    phase: '模型加载',
    nearestId: 'S-01',
    nearestLabel: '进站信号机',
    nearestDistance: 0,
    position: {
      x: -116,
      y: CAMERA_HEIGHT,
      z: -87
    },
    heading: 0,
    geo: worldToGeo(-116, -87),
    audioEnabled: false
  }

  const audio = {
    alarm: makeAudio('/assets/audio/alarm.wav', 0.35),
    notice: makeAudio('/assets/audio/pedestrian_notice.wav', 0.28),
    bgm: makeAudio('/assets/bgm/dl.mp3', 0.16, true)
  }

  function makeAudio(url, volume, loop = false) {
    const item = new Audio(url)
    item.volume = volume
    item.loop = loop
    item.preload = 'auto'
    return item
  }

  function init() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    scene.background = new THREE.Color(0x9fb9bc)
    scene.fog = new THREE.FogExp2(0x9fb9bc, 0.008)

    camera.position.copy(lastPosition)
    updateCameraRotation()
    setupLights()
    createGround()
    createRailBed()
    createVegetation()
    createBoundaryMarkers()
    bindEvents()
    resize()

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host || canvas)

    emitState(0, true)
    emitSignals()
    loadModels()
    animate()
  }

  function setupLights() {
    const hemi = new THREE.HemisphereLight(0xdceef2, 0x3d463c, 1.8)
    scene.add(hemi)

    const sun = new THREE.DirectionalLight(0xfff0c4, 3.1)
    sun.position.set(-70, 120, 48)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -160
    sun.shadow.camera.right = 160
    sun.shadow.camera.top = 140
    sun.shadow.camera.bottom = -140
    sun.shadow.camera.near = 10
    sun.shadow.camera.far = 260
    scene.add(sun)

    const side = new THREE.DirectionalLight(0xb8d8ff, 0.9)
    side.position.set(90, 45, -70)
    scene.add(side)
  }

  function createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 300, 24, 24),
      new THREE.MeshStandardMaterial({
        map: createGroundTexture(),
        roughness: 0.92,
        metalness: 0.02
      })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
  }

  function createGroundTexture() {
    const textureCanvas = document.createElement('canvas')
    textureCanvas.width = 512
    textureCanvas.height = 512
    const ctx = textureCanvas.getContext('2d')
    ctx.fillStyle = '#566552'
    ctx.fillRect(0, 0, 512, 512)

    for (let i = 0; i < 2200; i += 1) {
      const x = Math.random() * 512
      const y = Math.random() * 512
      const g = 74 + Math.random() * 42
      ctx.fillStyle = `rgba(${g}, ${g + 16}, ${g - 8}, ${0.18 + Math.random() * 0.22})`
      ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2)
    }

    const texture = new THREE.CanvasTexture(textureCanvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(18, 15)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  function createRailBed() {
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(298, 0.38, 18),
      new THREE.MeshStandardMaterial({
        color: 0x3f4240,
        roughness: 0.82
      })
    )
    bed.position.set(0, 0.05, 0)
    bed.rotation.y = -ROUTE_ANGLE
    bed.receiveShadow = true
    scene.add(bed)

    const sideLineMaterial = new THREE.MeshStandardMaterial({
      color: 0xd7c77e,
      roughness: 0.55,
      emissive: 0x2a2100,
      emissiveIntensity: 0.08
    })

    ;[-7.4, 7.4].forEach((offset) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(298, 0.08, 0.35), sideLineMaterial)
      line.position.set(Math.sin(ROUTE_ANGLE) * offset, 0.35, Math.cos(ROUTE_ANGLE) * offset)
      line.rotation.y = -ROUTE_ANGLE
      line.receiveShadow = true
      scene.add(line)
    })
  }

  function createVegetation() {
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6d5541, roughness: 0.8 })
    const foliageMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x2f6b46, roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ color: 0x496d3b, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x6b7341, roughness: 0.86 })
    ]

    for (let i = 0; i < 58; i += 1) {
      const t = seeded(i * 29.7)
      const side = i % 2 === 0 ? -1 : 1
      const along = -136 + t * 272
      const away = 24 + seeded(i * 17.9) * 72
      const direction = new THREE.Vector3(Math.cos(ROUTE_ANGLE), 0, Math.sin(ROUTE_ANGLE))
      const normal = new THREE.Vector3(-direction.z, 0, direction.x)
      const position = direction.multiplyScalar(along).add(normal.multiplyScalar(away * side))

      const tree = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 4.6, 8), trunkMaterial)
      trunk.position.y = 2.3
      trunk.castShadow = true
      tree.add(trunk)

      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(2.5 + seeded(i) * 1.2, 6 + seeded(i + 4) * 2.4, 9),
        foliageMaterials[i % foliageMaterials.length]
      )
      foliage.position.y = 6.4
      foliage.castShadow = true
      tree.add(foliage)

      tree.position.copy(position)
      tree.rotation.y = seeded(i * 2.1) * Math.PI
      scene.add(tree)
    }
  }

  function createBoundaryMarkers() {
    const material = new THREE.MeshStandardMaterial({
      color: 0xd9c06f,
      roughness: 0.52,
      emissive: 0x191000,
      emissiveIntensity: 0.12
    })

    for (let i = -5; i <= 5; i += 1) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 3.8, 10), material)
      post.position.set(-122 + i * 25, 1.9, -96 + i * 18.7)
      post.castShadow = true
      scene.add(post)
    }
  }

  function seeded(value) {
    const raw = Math.sin(value * 999.27) * 43758.5453
    return raw - Math.floor(raw)
  }

  async function loadModels() {
    state.loading = '加载铁路与信号模型'
    emitState(0, true)

    const entries = Object.entries(MODEL_URLS)
    const loaded = await Promise.allSettled(
      entries.map(async ([name, url]) => [name, await loader.loadAsync(url)])
    )

    loaded.forEach((result) => {
      if (result.status !== 'fulfilled') return
      const [name, gltf] = result.value
      gltf.scene.traverse((child) => {
        if (!child.isMesh) return
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          child.material = child.material.clone()
          child.material.needsUpdate = true
        }
      })
      models.set(name, gltf)
    })

    placeRailway()
    placeSignals()
    placeSceneModels()
    ready = true
    state.ready = true
    state.loading = '已就绪'
    state.phase = '沿线巡视'
    emitSignals()
    emitState(0, true)
    onEvent?.({ type: 'ready', message: '场景已就绪' })
  }

  function placeRailway() {
    const railway = models.get('railway')
    if (!railway) {
      createFallbackRailway()
      return
    }

    for (let i = 0; i < 12; i += 1) {
      const rail = cloneScene(railway.scene)
      rail.scale.setScalar(12)
      rail.position.set(-110 + i * 20, 0, -82 + i * 15)
      rail.rotation.y = Math.PI / 3.6
      scene.add(rail)
    }
  }

  function createFallbackRailway() {
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x323535, metalness: 0.45, roughness: 0.35 })
    const sleeperMaterial = new THREE.MeshStandardMaterial({ color: 0x665042, roughness: 0.82 })

    ;[-2.9, 2.9].forEach((offset) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(292, 0.32, 0.32), railMaterial)
      rail.position.set(Math.sin(ROUTE_ANGLE) * offset, 0.72, Math.cos(ROUTE_ANGLE) * offset)
      rail.rotation.y = -ROUTE_ANGLE
      rail.castShadow = true
      scene.add(rail)
    })

    for (let i = 0; i < 48; i += 1) {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.38, 1.1), sleeperMaterial)
      const along = -136 + i * 5.8
      sleeper.position.set(Math.cos(ROUTE_ANGLE) * along, 0.5, Math.sin(ROUTE_ANGLE) * along)
      sleeper.rotation.y = -ROUTE_ANGLE + Math.PI / 2
      sleeper.castShadow = true
      sleeper.receiveShadow = true
      scene.add(sleeper)
    }
  }

  function placeSignals() {
    const signModel = models.get('sign')

    SIGNAL_POINTS.forEach((point) => {
      const group = new THREE.Group()
      group.position.set(point.x, 0, point.z)
      group.rotation.y = Math.PI / 3.6

      if (signModel) {
        const sign = cloneScene(signModel.scene)
        sign.scale.setScalar(8)
        group.add(sign)
      } else {
        group.add(createFallbackSignal())
      }

      const color = signalColor(point.state)
      const light = new THREE.PointLight(color, 4.2, 34)
      light.position.set(0, 7.5, 0)
      group.add(light)

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.72, 20, 20),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 1.6,
          roughness: 0.28
        })
      )
      bulb.position.set(0, 7.6, 0)
      group.add(bulb)

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(5.3, 0.12, 12, 72),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.35,
          roughness: 0.4
        })
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.34
      group.add(ring)

      scene.add(group)
      signalRuntime.set(point.id, {
        ...point,
        inspected: false,
        group,
        light,
        bulb,
        ring
      })
    })
  }

  function createFallbackSignal() {
    const group = new THREE.Group()
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 7, 14),
      new THREE.MeshStandardMaterial({ color: 0x2b3030, roughness: 0.55, metalness: 0.28 })
    )
    pole.position.y = 3.5
    pole.castShadow = true
    group.add(pole)

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2.4, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x171a1a, roughness: 0.5 })
    )
    head.position.y = 7
    head.castShadow = true
    group.add(head)
    return group
  }

  function placeSceneModels() {
    const bridge = models.get('bridge')
    if (bridge) {
      const item = cloneScene(bridge.scene)
      item.scale.setScalar(9.8)
      item.position.set(8, 0.1, 6)
      item.rotation.y = -ROUTE_ANGLE
      scene.add(item)
    }

    const station = models.get('station')
    if (station) {
      const item = cloneScene(station.scene)
      item.scale.setScalar(18)
      item.position.set(STATION_POINT.x, 0, STATION_POINT.z)
      item.rotation.y = -Math.PI / 4
      scene.add(item)
    } else {
      createFallbackStation()
    }

    const worker = models.get('worker') || models.get('man')
    if (worker) {
      ;[
        [-55, -50, Math.PI / 5],
        [18, 12, -Math.PI / 2],
        [88, 66, Math.PI / 1.6]
      ].forEach(([x, z, rotation], index) => {
        const item = cloneScene(worker.scene)
        item.scale.setScalar(index === 1 ? 6.2 : 5.5)
        item.position.set(x, 0, z)
        item.rotation.y = rotation
        scene.add(item)
      })
    }

    const box = models.get('box')
    if (box) {
      ;[
        [-68, -42],
        [-63, -37],
        [58, 46],
        [63, 48]
      ].forEach(([x, z], index) => {
        const item = cloneScene(box.scene)
        item.scale.setScalar(7)
        item.position.set(x, 0.05, z)
        item.rotation.y = index * 0.45
        scene.add(item)
      })
    }

    placeTrain()
  }

  function createFallbackStation() {
    const station = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(22, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0x9c8e76, roughness: 0.75 })
    )
    body.position.y = 4
    body.castShadow = true
    body.receiveShadow = true
    station.add(body)

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(16, 5, 4),
      new THREE.MeshStandardMaterial({ color: 0x6d2d2c, roughness: 0.65 })
    )
    roof.position.y = 10
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true
    station.add(roof)

    station.position.set(STATION_POINT.x, 0, STATION_POINT.z)
    scene.add(station)
  }

  function placeTrain() {
    const locomotive = models.get('locomotive')
    if (locomotive) {
      train = cloneScene(locomotive.scene)
      train.scale.setScalar(11.5)
    } else {
      train = createFallbackTrain()
    }

    const start = trainCurve.getPointAt(0.1)
    train.position.copy(start)
    train.position.y = 0.7
    train.rotation.y = -ROUTE_ANGLE + Math.PI / 2
    scene.add(train)

    const gltf = models.get('locomotive')
    if (gltf?.animations?.length) {
      const mixer = new THREE.AnimationMixer(train)
      mixer.clipAction(gltf.animations[0]).play()
      mixers.push(mixer)
    }
  }

  function createFallbackTrain() {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(9, 3.2, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x31546a, roughness: 0.42, metalness: 0.18 })
    )
    body.position.y = 2.2
    body.castShadow = true
    group.add(body)

    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2.6, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xd5b351, roughness: 0.44 })
    )
    nose.position.set(5.4, 1.95, 0)
    nose.castShadow = true
    group.add(nose)
    return group
  }

  function cloneScene(source) {
    const cloned = cloneModel(source)
    cloned.traverse((child) => {
      if (!child.isMesh) return
      child.castShadow = true
      child.receiveShadow = true
      if (child.material) {
        child.material = child.material.clone()
      }
    })
    return cloned
  }

  function signalColor(stateName) {
    if (stateName === 'red') return 0xff3b30
    if (stateName === 'yellow') return 0xffc84d
    return 0x35d66b
  }

  function inspectedColor() {
    return 0x61d9ff
  }

  function bindEvents() {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function onKeyDown(event) {
    if (event.code === 'KeyR') {
      reset()
      return
    }

    setKey(event.code, true)
  }

  function onKeyUp(event) {
    setKey(event.code, false)
  }

  function setKey(code, value) {
    const map = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      KeyQ: 'turnLeft',
      KeyE: 'turnRight',
      ShiftLeft: 'sprint',
      ShiftRight: 'sprint'
    }
    const key = map[code]
    if (key) keys.set(key, value)
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === canvas
    state.locked = pointerLocked
    emitState(0, true)
  }

  function onMouseMove(event) {
    if (!running || !pointerLocked) return
    yaw -= event.movementX * 0.0022
    pitch -= event.movementY * 0.002
    pitch = THREE.MathUtils.clamp(pitch, -0.82, 0.55)
    updateCameraRotation()
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse') return
    dragLook = {
      x: event.clientX,
      y: event.clientY
    }
  }

  function onPointerMove(event) {
    if (!dragLook || event.pointerType === 'mouse') return
    const dx = event.clientX - dragLook.x
    const dy = event.clientY - dragLook.y
    dragLook.x = event.clientX
    dragLook.y = event.clientY
    yaw -= dx * 0.004
    pitch -= dy * 0.003
    pitch = THREE.MathUtils.clamp(pitch, -0.82, 0.55)
    updateCameraRotation()
  }

  function onPointerUp() {
    dragLook = null
  }

  function animate() {
    animationFrame = requestAnimationFrame(animate)
    const delta = Math.min(clock.getDelta(), 0.06)

    if (running && ready && !completed) {
      elapsed += delta
      updatePlayer(delta)
      updateSignals(delta)
      updateTrain(delta)
      updatePhase()
    } else {
      updateSignalPulses(delta)
      updateTrain(delta * 0.35)
    }

    mixers.forEach((mixer) => mixer.update(delta))
    renderer.render(scene, camera)
    emitState(delta)
  }

  function updatePlayer(delta) {
    const turnSpeed = 1.7
    if (keys.get('turnLeft')) yaw += turnSpeed * delta
    if (keys.get('turnRight')) yaw -= turnSpeed * delta

    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    const move = new THREE.Vector3()

    if (keys.get('forward')) move.add(forward)
    if (keys.get('backward')) move.sub(forward)
    if (keys.get('right')) move.add(right)
    if (keys.get('left')) move.sub(right)

    let speed = 0
    if (move.lengthSq() > 0) {
      move.normalize()
      speed = keys.get('sprint') ? 27 : 15
      camera.position.addScaledVector(move, speed * delta)
    }

    camera.position.x = THREE.MathUtils.clamp(camera.position.x, WORLD_LIMITS.minX, WORLD_LIMITS.maxX)
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, WORLD_LIMITS.minZ, WORLD_LIMITS.maxZ)
    camera.position.y = CAMERA_HEIGHT

    const moved = camera.position.distanceTo(lastPosition)
    if (moved > 0) {
      distanceTravelled += moved
      lastPosition.copy(camera.position)
    }

    state.speed = Math.round(speed * 3.6)
    updateCameraRotation()
  }

  function updateSignals(delta) {
    updateSignalPulses(delta)
    const playerPosition = camera.position

    signalRuntime.forEach((signal) => {
      if (signal.inspected) return
      const distance = flatDistance(playerPosition.x, playerPosition.z, signal.x, signal.z)
      if (distance > 8) return

      signal.inspected = true
      signal.light.color.setHex(inspectedColor())
      signal.bulb.material.color.setHex(inspectedColor())
      signal.bulb.material.emissive.setHex(inspectedColor())
      signal.ring.material.color.setHex(inspectedColor())
      signal.ring.material.emissive.setHex(inspectedColor())
      signal.ring.scale.setScalar(1.25)
      playNotice()
      onEvent?.({ type: 'signal', message: `${signal.id} 已巡视` })
      emitSignals()
    })
  }

  function updateSignalPulses(delta) {
    const t = elapsed * 2.6
    signalRuntime.forEach((signal, index) => {
      const pulse = 1 + Math.sin(t + index * 0.8) * 0.08
      signal.ring.scale.setScalar(signal.inspected ? 1.2 : pulse)
      signal.bulb.material.emissiveIntensity = signal.inspected ? 1.35 : 1.4 + Math.sin(t + index) * 0.25
      signal.group.rotation.y += delta * 0.04
    })
  }

  function updateTrain(delta) {
    if (!train) return

    trainProgress = (trainProgress + delta * 0.028) % 1
    const position = trainCurve.getPointAt(trainProgress)
    const lookAt = trainCurve.getPointAt((trainProgress + 0.006) % 1)
    train.position.set(position.x, 0.7, position.z)
    train.rotation.y = Math.atan2(lookAt.x - position.x, lookAt.z - position.z) + Math.PI / 2

    const trainDistance = flatDistance(camera.position.x, camera.position.z, position.x, position.z)
    const now = performance.now()
    if (running && ready && now - runStartedAt > 8000 && trainDistance < 10 && now - lastWarningAt > 2200) {
      lastWarningAt = now
      health = Math.max(0, health - 8)
      playAlarm()
      onEvent?.({ type: 'warning', message: '机车接近巡视路径' })
    }
  }

  function updatePhase() {
    const inspected = Array.from(signalRuntime.values()).filter((signal) => signal.inspected).length
    const stationDistance = flatDistance(camera.position.x, camera.position.z, STATION_POINT.x, STATION_POINT.z)

    if (inspected === SIGNAL_POINTS.length && stationDistance < 14) {
      completed = true
      running = false
      state.completed = true
      state.phase = '任务完成'
      stopBgm()
      onEvent?.({ type: 'complete', message: '巡视任务完成' })
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      return
    }

    state.phase = inspected === SIGNAL_POINTS.length ? '返抵车站' : '沿线巡视'
  }

  function flatDistance(ax, az, bx, bz) {
    return Math.hypot(ax - bx, az - bz)
  }

  function findNearest() {
    const pending = Array.from(signalRuntime.values()).filter((signal) => !signal.inspected)
    const targets = pending.length > 0 ? pending : [STATION_POINT]
    let nearest = targets[0]
    let nearestDistance = Number.POSITIVE_INFINITY

    targets.forEach((target) => {
      const distance = flatDistance(camera.position.x, camera.position.z, target.x, target.z)
      if (distance < nearestDistance) {
        nearest = target
        nearestDistance = distance
      }
    })

    return {
      id: nearest.id,
      label: nearest.label,
      distance: nearestDistance
    }
  }

  function updateCameraRotation() {
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw
    camera.rotation.x = pitch
    camera.rotation.z = 0
  }

  function emitState(delta, force = false) {
    const now = performance.now()
    if (!force && now - lastStateEmit < 80) return
    lastStateEmit = now

    const nearest = findNearest()
    const inspected = Array.from(signalRuntime.values()).filter((signal) => signal.inspected).length

    state.ready = ready
    state.running = running
    state.locked = pointerLocked
    state.elapsed = elapsed
    state.distance = distanceTravelled
    state.health = health
    state.inspected = inspected
    state.total = SIGNAL_POINTS.length
    state.completed = completed
    state.nearestId = nearest.id
    state.nearestLabel = nearest.label
    state.nearestDistance = nearest.distance
    state.heading = THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(-yaw), 360)
    state.audioEnabled = audioEnabled
    state.position = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z
    }
    state.geo = worldToGeo(camera.position.x, camera.position.z)

    onState?.({ ...state, position: { ...state.position }, geo: { ...state.geo }, delta })
  }

  function emitSignals() {
    const payload = SIGNAL_POINTS.map((point) => {
      const runtime = signalRuntime.get(point.id)
      const geo = worldToGeo(point.x, point.z)
      return {
        ...point,
        inspected: runtime?.inspected || false,
        geo
      }
    })

    onSignals?.(payload)
  }

  function resize() {
    const rect = (host || canvas).getBoundingClientRect()
    const width = Math.max(320, Math.floor(rect.width || window.innerWidth))
    const height = Math.max(320, Math.floor(rect.height || window.innerHeight))

    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }

  function playNotice() {
    if (!audioEnabled) return
    audio.notice.currentTime = 0
    audio.notice.play().catch(() => {})
  }

  function playAlarm() {
    if (!audioEnabled) return
    audio.alarm.currentTime = 0
    audio.alarm.play().catch(() => {})
  }

  function playBgm() {
    if (!audioEnabled || !running) return
    audio.bgm.play().catch(() => {})
  }

  function stopBgm() {
    audio.bgm.pause()
  }

  function start() {
    if (!ready || completed) return
    if (!running) runStartedAt = performance.now()
    if (!running && train && flatDistance(camera.position.x, camera.position.z, train.position.x, train.position.z) < 28) {
      trainProgress = 0.52
      const position = trainCurve.getPointAt(trainProgress)
      const lookAt = trainCurve.getPointAt((trainProgress + 0.006) % 1)
      train.position.set(position.x, 0.7, position.z)
      train.rotation.y = Math.atan2(lookAt.x - position.x, lookAt.z - position.z) + Math.PI / 2
    }
    lastWarningAt = performance.now()
    running = true
    state.running = true
    playBgm()
    if (canvas.requestPointerLock && !isTouchDevice()) {
      const lockRequest = canvas.requestPointerLock()
      if (lockRequest?.catch) lockRequest.catch(() => {})
    }
    emitState(0, true)
  }

  function pause() {
    running = false
    state.running = false
    stopBgm()
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock()
    }
    emitState(0, true)
  }

  function reset() {
    running = false
    completed = false
    elapsed = 0
    distanceTravelled = 0
    health = 100
    yaw = INITIAL_YAW
    pitch = -0.06
    camera.position.set(-116, CAMERA_HEIGHT, -87)
    lastPosition.copy(camera.position)
    updateCameraRotation()
    signalRuntime.forEach((signal) => {
      signal.inspected = false
      const color = signalColor(signal.state)
      signal.light.color.setHex(color)
      signal.bulb.material.color.setHex(color)
      signal.bulb.material.emissive.setHex(color)
      signal.ring.material.color.setHex(color)
      signal.ring.material.emissive.setHex(color)
      signal.ring.scale.setScalar(1)
    })
    state.completed = false
    state.phase = ready ? '沿线巡视' : '模型加载'
    stopBgm()
    if (document.pointerLockElement === canvas) document.exitPointerLock()
    emitSignals()
    emitState(0, true)
  }

  function setAudioEnabled(value) {
    audioEnabled = value
    if (audioEnabled) {
      playBgm()
    } else {
      audio.alarm.pause()
      audio.notice.pause()
      stopBgm()
    }
    emitState(0, true)
  }

  function setVirtualInput(name, value) {
    keys.set(name, value)
    if (value && !running && ready && !completed) start()
  }

  function isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches
  }

  function dispose() {
    cancelAnimationFrame(animationFrame)
    resizeObserver?.disconnect()
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    document.removeEventListener('pointerlockchange', onPointerLockChange)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    stopBgm()
    renderer.dispose()
    scene.traverse((object) => {
      if (!object.isMesh) return
      object.geometry?.dispose()
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose())
      } else {
        object.material?.dispose()
      }
    })
  }

  init()

  return {
    start,
    pause,
    reset,
    dispose,
    setAudioEnabled,
    setVirtualInput
  }
}
