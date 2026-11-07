<script setup lang="ts">
import type { VrmFrameCostSummary } from '@proj-airi/stage-ui-three/trace'

import { useModelStore } from '@proj-airi/stage-ui-three'
import { acquireStageThreeRuntimeTrace, getStageThreeRuntimeTraceContext, stageThreeTraceVrmUpdateFrameEvent, VrmFrameCostWindow } from '@proj-airi/stage-ui-three/trace'
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
/**
 * The whole body, like the `full` view of TalkingHead: she also sits on the floor and raises her arms.
 * `/mirror?view=bust` keeps the usual framing of the head and the chest.
 */
const framing = new URLSearchParams(location.search).get('view') === 'bust' ? 'default' : 'full-body'

/**
 * `/mirror?mouth=0.7` sets the mouth opening of the lip sync, from 0.2 to 1, like the VRM settings page.
 * The browser keeps the value, so the next load without the parameter uses it too.
 */
const mouth = Number.parseFloat(new URLSearchParams(location.search).get('mouth') ?? '')
if (Number.isFinite(mouth))
  useModelStore().lipSyncMouthOpening = Math.min(Math.max(mouth, 0.2), 1)

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

/**
 * `/mirror?stats=1` measures the VRM update on the mirror computer (Plan 06, F4): the fps and the
 * average time of each motion layer, every 5 seconds, on the page and in the console.
 */
const stats = ref<VrmFrameCostSummary>()
if (new URLSearchParams(location.search).has('stats')) {
  const costs = new VrmFrameCostWindow()
  const releaseTrace = acquireStageThreeRuntimeTrace()
  const stopFrames = getStageThreeRuntimeTraceContext().on(stageThreeTraceVrmUpdateFrameEvent, (event) => {
    if (event?.body)
      costs.add(event.body)
  })
  const timer = setInterval(() => {
    const summary = costs.take()
    if (!summary)
      return
    stats.value = summary
    console.info('[mirror-stats]', JSON.stringify(summary))
  }, 5000)
  onUnmounted(() => {
    clearInterval(timer)
    stopFrames()
    releaseTrace()
  })
}
</script>

<template>
  <div data-testid="mirror-stage" :class="['fixed inset-0 overflow-hidden bg-transparent']">
    <WidgetStage
      v-model:state="modelState"
      h-full w-full
      :enable-orbit-controls="false"
      :paused="false"
      :vrm-framing="framing"
    />
    <pre
      v-if="stats"
      data-testid="mirror-stats"
      :class="['absolute left-2 top-2 m-0 rounded bg-black/60 p-2 text-xs text-white font-mono']"
    >{{ `${stats.fps} fps, VRM ${stats.averageMs} ms (p95 ${stats.p95Ms})\n${Object.entries(stats.steps).map(([step, ms]) => `${step.replace(/Ms$/, '')} ${ms}`).join('\n')}` }}</pre>
  </div>
</template>

<route lang="yaml">
name: MirrorScenePage
meta:
  layout: plain
  onboarding: false
</route>
