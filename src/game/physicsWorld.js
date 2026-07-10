import * as CANNON from 'cannon-es'

export function createPhysicsWorld() {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
  })
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.allowSleep = true

  const material = new CANNON.Material('railway-default')
  const contactMaterial = new CANNON.ContactMaterial(material, material, {
    friction: 0.32,
    restitution: 0.02
  })
  world.defaultContactMaterial = contactMaterial
  world.addContactMaterial(contactMaterial)

  const bodies = new Map()

  function addGround(size = 320) {
    const body = new CANNON.Body({
      mass: 0,
      material,
      shape: new CANNON.Plane()
    })
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    body.userData = { type: 'ground', size }
    world.addBody(body)
    bodies.set('ground', body)
    return body
  }

  function addStaticBox(id, position, size, rotationY = 0) {
    const body = new CANNON.Body({
      mass: 0,
      material,
      shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2))
    })
    body.position.set(position.x, position.y + size.y / 2, position.z)
    body.quaternion.setFromEuler(0, rotationY, 0)
    body.userData = { id, type: 'static-box' }
    world.addBody(body)
    bodies.set(id, body)
    return body
  }

  function createPlayerBody(position, radius = 0.55, height = 1.8) {
    const body = new CANNON.Body({
      mass: 70,
      material,
      fixedRotation: true,
      linearDamping: 0.72
    })
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, height - radius, 0))
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, radius, 0))
    body.position.set(position.x, position.y, position.z)
    body.userData = { type: 'player' }
    world.addBody(body)
    bodies.set('player', body)
    return body
  }

  function removeBody(id) {
    const body = bodies.get(id)
    if (!body) return
    world.removeBody(body)
    bodies.delete(id)
  }

  function step(delta) {
    world.step(1 / 60, delta, 3)
  }

  function clear() {
    Array.from(bodies.keys()).forEach(removeBody)
  }

  return {
    world,
    bodies,
    addGround,
    addStaticBox,
    createPlayerBody,
    removeBody,
    step,
    clear
  }
}
