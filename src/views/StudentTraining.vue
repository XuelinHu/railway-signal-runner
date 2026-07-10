<template>
  <RailwayFpsGame initial-mode="train" role="student" :scene-id="sceneId" />
</template>

<script setup>
import RailwayFpsGame from '../components/RailwayFpsGame.vue'

defineProps({
  sceneId: {
    type: String,
    required: true
  }
})
</script>
