<script setup lang="ts">
import type { NeoAliceSpeechMode } from '../../stores/modules/neoalice-bridge'

import { errorMessageFrom } from '@moeru/std'
import { Alert, Button, FieldCheckbox, FieldInput, FieldSelect, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useNeoAliceBrainStore } from '../../stores/modules/neoalice-brain'
import { useNeoAliceBridgeStore } from '../../stores/modules/neoalice-bridge'
import { loadServerDefaults } from '../../stores/server-defaults'

const { t } = useI18n()
const bridge = useNeoAliceBridgeStore()
const {
  enabled,
  brokerUrl,
  site,
  acceptAnySite,
  companionSite,
  moodSite,
  username,
  password,
  speechMode,
  voiceInput,
  userId,
  announceState,
  voiceStatus,
  voiceError,
  lastHeard,
  configured,
  status,
  lastError,
  receivedCount,
  ignoredCount,
  lastIgnored,
  lastEvent,
} = storeToRefs(bridge)

const { brainMode, serverUrl } = storeToRefs(useNeoAliceBrainStore())

const serverLoad = ref<{ tone: 'success' | 'danger', text: string }>()
const serverLoading = ref(false)

async function loadFromServer() {
  serverLoading.value = true
  serverLoad.value = undefined
  try {
    const loaded = await loadServerDefaults({ overwrite: true })
    serverLoad.value = loaded
      ? { tone: 'success', text: t('settings.pages.modules.neoalice-bridge.server.loaded') }
      : { tone: 'danger', text: t('settings.pages.modules.neoalice-bridge.server.missing') }
  }
  catch (error) {
    serverLoad.value = { tone: 'danger', text: errorMessageFrom(error) ?? t('settings.pages.modules.neoalice-bridge.server.missing') }
  }
  finally {
    serverLoading.value = false
  }
}

// The page keeps the connection open, so the status shows while the user edits the settings.
onScopeDispose(bridge.hold())

const speechModes = computed<{ value: NeoAliceSpeechMode, label: string }[]>(() => [
  { value: 'silent', label: t('settings.pages.modules.neoalice-bridge.speech-mode.silent') },
  { value: 'neoalice-audio', label: t('settings.pages.modules.neoalice-bridge.speech-mode.neoalice-audio') },
  { value: 'airi-voice', label: t('settings.pages.modules.neoalice-bridge.speech-mode.airi-voice') },
])

const voiceTone = computed(() => voiceStatus.value === 'error' ? 'danger' : 'info')

const statusTone = computed(() => status.value === 'connected' ? 'success' : status.value === 'error' ? 'danger' : 'info')
</script>

<template>
  <SettingsCard>
    <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.modules.neoalice-bridge.intro') }}
    </p>

    <FieldInput
      v-model="serverUrl"
      :label="t('settings.pages.modules.neoalice-bridge.server.url')"
      :description="t('settings.pages.modules.neoalice-bridge.server.url-description')"
      placeholder="http://192.0.2.10:4173"
    />
    <div :class="['flex', 'flex-col', 'gap-2']">
      <Button :disabled="serverLoading" data-testid="neoalice-load-server" @click="loadFromServer">
        {{ t('settings.pages.modules.neoalice-bridge.server.load') }}
      </Button>
      <Alert v-if="serverLoad" :tone="serverLoad.tone" data-testid="neoalice-load-server-result">
        {{ serverLoad.text }}
      </Alert>
    </div>

    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.neoalice-bridge.enable')"
      :description="t('settings.pages.modules.neoalice-bridge.enable-description')"
    />

    <FieldInput
      v-model="brokerUrl"
      :label="t('settings.pages.modules.neoalice-bridge.broker-url')"
      :description="t('settings.pages.modules.neoalice-bridge.broker-url-description')"
      placeholder="ws://192.0.2.10:9001"
    />

    <FieldInput
      v-model="site"
      :label="t('settings.pages.modules.neoalice-bridge.site')"
      :description="t('settings.pages.modules.neoalice-bridge.site-description')"
    />

    <FieldCheckbox
      v-model="acceptAnySite"
      :label="t('settings.pages.modules.neoalice-bridge.accept-any-site')"
      :description="t('settings.pages.modules.neoalice-bridge.accept-any-site-description')"
    />

    <FieldInput
      v-model="companionSite"
      :label="t('settings.pages.modules.neoalice-bridge.companion-site')"
      :description="t('settings.pages.modules.neoalice-bridge.companion-site-description')"
    />

    <FieldInput
      v-model="moodSite"
      :label="t('settings.pages.modules.neoalice-bridge.mood-site')"
      :description="t('settings.pages.modules.neoalice-bridge.mood-site-description')"
    />

    <FieldInput v-model="username" :label="t('settings.pages.modules.neoalice-bridge.username')" />
    <FieldInput v-model="password" type="password" :label="t('settings.pages.modules.neoalice-bridge.password')" />

    <FieldSelect
      v-model="speechMode"
      :options="speechModes"
      :label="t('settings.pages.modules.neoalice-bridge.speech-mode.title')"
      :description="t('settings.pages.modules.neoalice-bridge.speech-mode.description')"
    />

    <FieldCheckbox
      v-model="brainMode"
      :label="t('settings.pages.modules.neoalice-bridge.brain-mode')"
      :description="t('settings.pages.modules.neoalice-bridge.brain-mode-description')"
    />

    <FieldCheckbox
      v-model="voiceInput"
      :label="t('settings.pages.modules.neoalice-bridge.voice.enable')"
      :description="t('settings.pages.modules.neoalice-bridge.voice.enable-description')"
    />

    <template v-if="voiceInput">
      <FieldInput
        v-model="userId"
        :label="t('settings.pages.modules.neoalice-bridge.voice.user-id')"
        :description="t('settings.pages.modules.neoalice-bridge.voice.user-id-description')"
      />

      <Alert :tone="voiceTone" data-testid="neoalice-voice-status">
        <div>{{ t(`settings.pages.modules.neoalice-bridge.voice.status.${voiceStatus}`) }}</div>
        <div v-if="voiceError" :class="['text-xs']">
          {{ voiceError }}
        </div>
        <div v-if="lastHeard" :class="['text-xs']">
          {{ t('settings.pages.modules.neoalice-bridge.voice.last-reply', { text: lastHeard }) }}
        </div>
      </Alert>
    </template>

    <FieldCheckbox
      v-model="announceState"
      :label="t('settings.pages.modules.neoalice-bridge.announce-state')"
      :description="t('settings.pages.modules.neoalice-bridge.announce-state-description')"
    />

    <Alert v-if="enabled && !configured" tone="warning">
      {{ t('settings.pages.modules.neoalice-bridge.not-configured') }}
    </Alert>
    <Alert v-else-if="enabled" :tone="statusTone" data-testid="neoalice-bridge-status">
      <div>{{ t(`settings.pages.modules.neoalice-bridge.status.${status}`) }}</div>
      <div v-if="lastError" :class="['text-xs']">
        {{ lastError }}
      </div>
      <div :class="['text-xs']">
        {{ t('settings.pages.modules.neoalice-bridge.counters', { received: receivedCount, ignored: ignoredCount }) }}
      </div>
      <div v-if="lastEvent" :class="['text-xs']">
        {{ t('settings.pages.modules.neoalice-bridge.last-event', { event: lastEvent }) }}
      </div>
      <div v-if="lastIgnored" :class="['text-xs', 'break-all']">
        {{ t('settings.pages.modules.neoalice-bridge.last-ignored', { reason: lastIgnored }) }}
      </div>
    </Alert>
  </SettingsCard>
</template>
