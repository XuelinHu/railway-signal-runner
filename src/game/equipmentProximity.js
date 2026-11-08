export function findNearbyEquipment(targets, position, radius = 14) {
  let nearest = null
  let nearestDistance = radius
  for (const target of targets) {
    const distance = Math.hypot(position.x - target.x, position.z - target.z)
    if (distance > nearestDistance) continue
    nearest = target
    nearestDistance = distance
  }
  return nearest ? {
    id: nearest.id,
    name: nearest.name || nearest.label,
    catalogKey: nearest.catalogKey || '',
    title: nearest.task?.title || nearest.label,
    description: nearest.task?.description || '',
    distance: Math.round(nearestDistance * 10) / 10,
    inspected: Boolean(nearest.inspected),
  } : null
}
