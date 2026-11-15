<script setup lang="ts">
import type { ComputerUsePermission } from '../../../../shared/eventa/computer-use'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { CheckBar } from '@proj-airi/stage-ui/components'
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { computerUsePermissionChanged, computerUsePermissionGet, computerUsePermissionSet } from '../../../../shared/eventa/computer-use'

const { t } = useI18n()
const eventaContext = useElectronEventaContext()
const getPermission = useElectronEventaInvoke(computerUsePermissionGet)
const setPermission = useElectronEventaInvoke(computerUsePermissionSet)

const permission = ref<ComputerUsePermission>()
const busy = ref(false)
const error = ref('')

const stopListening = eventaContext.value.on(computerUsePermissionChanged, (event) => {
  permission.value = event.body
})
onMounted(async () => {
  try {
    permission.value = await getPermission()
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.system.computer-control.load-error')
  }
})
onUnmounted(stopListening)

async function update(patch: Partial<ComputerUsePermission>) {
  busy.value = true
  error.value = ''
  try {
    permission.value = await setPermission(patch)
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('tamagotchi.settings.pages.system.computer-control.save-error')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-2']">
    <CheckBar
      :model-value="permission?.enabled ?? false"
      :disabled="permission === undefined || busy"
      icon-on="i-solar:mouse-circle-bold-duotone"
      icon-off="i-solar:mouse-circle-line-duotone"
      text="tamagotchi.settings.pages.system.computer-control.master.title"
      description="tamagotchi.settings.pages.system.computer-control.master.description"
      transition="all ease-in-out duration-250"
      @update:model-value="update({ enabled: $event === true })"
    />
    <CheckBar
      :model-value="permission?.allowRemote ?? false"
      :disabled="permission === undefined || busy || !permission.enabled"
      icon-on="i-solar:wi-fi-router-bold-duotone"
      icon-off="i-solar:wi-fi-router-line-duotone"
      text="tamagotchi.settings.pages.system.computer-control.remote.title"
      description="tamagotchi.settings.pages.system.computer-control.remote.description"
      transition="all ease-in-out duration-250"
      @update:model-value="update({ allowRemote: $event === true })"
    />
    <CheckBar
      :model-value="permission?.confirmRemote ?? true"
      :disabled="permission === undefined || busy || !permission.allowRemote"
      icon-on="i-solar:shield-check-bold-duotone"
      icon-off="i-solar:shield-line-duotone"
      text="tamagotchi.settings.pages.system.computer-control.confirm.title"
      description="tamagotchi.settings.pages.system.computer-control.confirm.description"
      transition="all ease-in-out duration-250"
      @update:model-value="update({ confirmRemote: $event === true })"
    />
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.pages.system.computer-control.note') }}
    </p>
    <p v-if="error" role="alert" :class="['text-sm text-red-500']">
      {{ error }}
    </p>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.system.computer-control.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
