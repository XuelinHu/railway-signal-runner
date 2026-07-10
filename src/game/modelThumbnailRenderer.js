import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneModel } from 'three/examples/jsm/utils/SkeletonUtils.js'

const thumbnailCache = new Map()
const thumbnailRequests = new Map()
const loader = new GLTFLoader()
let renderQueue = Promise.resolve()

let renderer
let scene
let camera
let modelRoot

export async function generateModelThumbnail(url) {
  if (thumbnailCache.has(url)) return thumbnailCache.get(url)
  if (thumbnailRequests.has(url)) return thumbnailRequests.get(url)

  const request = enqueueRender(async () => {
    setupRenderer()
    const gltf = await loader.loadAsync(url)
    const model = cloneModel(gltf.scene)
    clearModelRoot()
    modelRoot.add(model)
    frameObject(model)
    renderer.render(scene, camera)

    const dataUrl = renderer.domElement.toDataURL('image/png')
    thumbnailCache.set(url, dataUrl)
    modelRoot.remove(model)
    disposeModel(model)
    renderer.renderLists.dispose()
    return dataUrl
  })

  thumbnailRequests.set(url, request)
  try {
    return await request
  } finally {
    thumbnailRequests.delete(url)
  }
}

function enqueueRender(task) {
  const request = renderQueue.then(task, task)
  renderQueue = request.catch(() => {})
  return request
}

function setupRenderer() {
  if (renderer) return

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power'
  })
  renderer.setPixelRatio(1)
  renderer.setSize(240, 160, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x243139)
  camera = new THREE.PerspectiveCamera(32, 3 / 2, 0.01, 1000)

  modelRoot = new THREE.Group()
  scene.add(modelRoot)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334038, 2.4))

  const key = new THREE.DirectionalLight(0xfff3cb, 2.2)
  key.position.set(4, 8, 6)
  scene.add(key)
}

function clearModelRoot() {
  while (modelRoot.children.length) {
    modelRoot.remove(modelRoot.children[0])
  }
}

function frameObject(model) {
  model.position.set(0, 0, 0)
  model.rotation.set(0, -Math.PI / 5, 0)
  model.scale.set(1, 1, 1)
  model.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z) || 1
  model.scale.multiplyScalar(3 / maxSize)
  model.updateMatrixWorld(true)

  const scaledBox = new THREE.Box3().setFromObject(model)
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3())
  model.position.sub(scaledCenter)
  model.updateMatrixWorld(true)

  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere())
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2)
  const distance = Math.max(3.2, sphere.radius / Math.sin(halfFov) * 1.12)
  camera.position.copy(new THREE.Vector3(1, 0.72, 1.35).normalize().multiplyScalar(distance))
  camera.near = Math.max(0.01, distance - sphere.radius * 2)
  camera.far = distance + sphere.radius * 3
  camera.updateProjectionMatrix()
  camera.lookAt(0, 0, 0)
}

function disposeModel(model) {
  model.traverse((child) => {
    if (!child.isMesh) return
    child.geometry?.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      if (!material) return
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose()
      })
      material.dispose()
    })
  })
}
