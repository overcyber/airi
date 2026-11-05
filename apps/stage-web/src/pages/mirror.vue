<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { onMounted, onUnmounted, ref } from 'vue'

/**
 * The page of the MagicMirror (Plan 06, F3): the avatar only, on a transparent background.
 *
 * The `MMM-AiriStage` module shows it in an iframe. The stage keeps the NeoAlice bridge and the
 * microphone of its settings, so the avatar speaks, moves, and listens like the TalkingHead avatar.
 * There is no header, no chat, and no onboarding.
 */
const modelState = ref<'pending' | 'loading' | 'mounted'>('pending')

// The mirror shows the page over its black screen, so the page itself has no background.
const saved = { html: '', body: '' }
onMounted(() => {
  saved.html = document.documentElement.style.background
  saved.body = document.body.style.background
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
})
onUnmounted(() => {
  document.documentElement.style.background = saved.html
  document.body.style.background = saved.body
})
</script>

<template>
  <div data-testid="mirror-stage" :class="['fixed inset-0 overflow-hidden bg-transparent']">
    <WidgetStage
      v-model:state="modelState"
      h-full w-full
      :enable-orbit-controls="false"
      :paused="false"
    />
  </div>
</template>

<route lang="yaml">
name: MirrorScenePage
meta:
  layout: plain
  onboarding: false
</route>
