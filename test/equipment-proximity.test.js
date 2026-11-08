import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findNearbyEquipment } from '../src/game/equipmentProximity.js'

test('keeps inspected equipment accessible for contextual chat', () => {
  const targets = [
    { id: 'a', x: 4, z: 3, label: '信号机', inspected: true, task: { title: '检查信号机' } },
    { id: 'b', x: 12, z: 0, label: '设备箱', inspected: false },
  ]
  assert.deepEqual(findNearbyEquipment(targets, { x: 0, z: 0 }), {
    id: 'a', name: '信号机', catalogKey: '', title: '检查信号机',
    description: '', distance: 5, inspected: true,
  })
  assert.equal(findNearbyEquipment(targets, { x: -30, z: -30 }), null)
})
