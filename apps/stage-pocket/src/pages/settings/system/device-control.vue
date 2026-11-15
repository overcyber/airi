<script setup lang="ts">
import { App } from '@capacitor/app'
import { errorMessageFrom } from '@moeru/std'
import { CheckBar } from '@proj-airi/stage-ui/components'
import { useDeviceControlStore } from '@proj-airi/stage-ui/stores/device-control'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { DeviceControl, isAndroidApp } from '../../../modules/device-control'

const { t } = useI18n()
const store = useDeviceControlStore()
const { enabled, allowRemote, confirmRemote, activity } = storeToRefs(store)

const android = isAndroidApp()
const running = ref(false)
const error = ref('')
let removeResumeListener: (() => void) | undefined

async function refreshStatus() {
  if (!android)
    return
  try {
    running.value = (await DeviceControl.status()).running
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? ''
  }
}

async function openSystemSettings() {
  error.value = ''
  try {
    await DeviceControl.openAccessibilitySettings()
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? ''
  }
}

onMounted(async () => {
  await refreshStatus()
  // The user comes back from the system settings: check the service again.
  if (android)
    removeResumeListener = (await App.addListener('resume', refreshStatus)).remove
})
onUnmounted(() => removeResumeListener?.())

function time(at: number) {
  return new Date(at).toLocaleTimeString()
}
</script>

<template>
  <div :class="['flex flex-col gap-3 pb-12']">
    <section :class="['flex flex-col gap-2 rounded-xl p-3', 'bg-neutral-100 dark:bg-neutral-800/60']">
      <h2 :class="['text-base font-medium']">
        {{ t('settings.pages.system.device-control.service.title') }}
      </h2>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-300']">
        <template v-if="!android">
          {{ t('settings.pages.system.device-control.service.unsupported') }}
        </template>
        <template v-else-if="running">
          {{ t('settings.pages.system.device-control.service.running') }}
        </template>
        <template v-else>
          {{ t('settings.pages.system.device-control.service.off') }}
        </template>
      </p>
      <button
        v-if="android"
        type="button"
        :class="['self-start rounded-lg px-3 py-2 text-sm', 'bg-primary-500 text-white']"
        @click="openSystemSettings"
      >
        {{ t('settings.pages.system.device-control.service.open') }}
      </button>
    </section>

    <CheckBar
      v-model="enabled"
      :disabled="!android"
      icon-on="i-solar:smartphone-bold-duotone"
      icon-off="i-solar:smartphone-line-duotone"
      text="settings.pages.system.device-control.master.title"
      description="settings.pages.system.device-control.master.description"
      transition="all ease-in-out duration-250"
    />
    <CheckBar
      v-model="allowRemote"
      :disabled="!android || !enabled"
      icon-on="i-solar:wi-fi-router-bold-duotone"
      icon-off="i-solar:wi-fi-router-line-duotone"
      text="settings.pages.system.device-control.remote.title"
      description="settings.pages.system.device-control.remote.description"
      transition="all ease-in-out duration-250"
    />
    <CheckBar
      v-model="confirmRemote"
      :disabled="!android || !allowRemote"
      icon-on="i-solar:shield-check-bold-duotone"
      icon-off="i-solar:shield-line-duotone"
      text="settings.pages.system.device-control.confirm.title"
      description="settings.pages.system.device-control.confirm.description"
      transition="all ease-in-out duration-250"
    />

    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.system.device-control.note') }}
    </p>
    <p v-if="error" role="alert" :class="['text-sm text-red-500']">
      {{ error }}
    </p>

    <section :class="['flex flex-col gap-1']">
      <h2 :class="['text-base font-medium']">
        {{ t('settings.pages.system.device-control.activity.title') }}
      </h2>
      <p v-if="activity.length === 0" :class="['text-sm text-neutral-500']">
        {{ t('settings.pages.system.device-control.activity.empty') }}
      </p>
      <ul v-else :class="['flex flex-col gap-1 text-sm']">
        <li v-for="entry in activity" :key="entry.at + entry.summary + entry.source">
          <span :class="['text-neutral-500']">{{ time(entry.at) }}</span>
          <span> {{ entry.source === 'tool' ? '' : `${t(`settings.pages.system.device-control.activity.${entry.source}`)}: ` }}{{ entry.summary }}</span>
          <span :class="[entry.ok ? 'text-green-600' : 'text-red-500']"> {{ entry.ok ? t('settings.pages.system.device-control.activity.done') : `${t('settings.pages.system.device-control.activity.refused')}${entry.error ? ` (${entry.error})` : ''}` }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.device-control.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
