<script setup lang="ts">
import type { MotionDirectoryEntry } from '@proj-airi/stage-ui/libs/alice-motion/motion-directory'

import { useNeoAliceMotionDirectory } from '@proj-airi/stage-ui/composables/use-neoalice-motion-directory'
import { avatarRigDownload, mosquittoCommand, motionDirectory } from '@proj-airi/stage-ui/libs/alice-motion/motion-directory'
import { useNeoAliceBridgeStore } from '@proj-airi/stage-ui/stores/modules/neoalice-bridge'
import { useVrmMotionsStore } from '@proj-airi/stage-ui/stores/vrm-motions'
import { computed, onMounted, ref } from 'vue'

/**
 * Every motion of the avatar on one page (Plan 12): the poses and gestures of the catalog, the animation files, and
 * the poses and movements that NeoAlice or an LLM created and saved. Each row has the MQTT command and a Play button.
 */
const vrmMotions = useVrmMotionsStore()
const bridge = useNeoAliceBridgeStore()
const directory = useNeoAliceMotionDirectory()
const filter = ref('')
const notice = ref('')

onMounted(() => {
  void vrmMotions.load()
  void directory.connect()
})

const entries = computed(() => motionDirectory(vrmMotions.motionLibrary.emotes, directory.customMotions.value))
const shown = computed(() => {
  const text = filter.value.trim().toLowerCase()
  return text ? entries.value.filter(entry => `${entry.name} ${entry.description} ${entry.origin}`.toLowerCase().includes(text)) : entries.value
})
const brokerHost = computed(() => {
  try {
    return new URL(bridge.brokerUrl).hostname || '192.0.2.10'
  }
  catch {
    return '192.0.2.10'
  }
})
const groupNames: Record<MotionDirectoryEntry['group'], string> = { pose: 'Pose', gesto: 'Gesto', animacao: 'Animação', criado: 'Criado pelo LLM' }

function commandOf(entry: MotionDirectoryEntry) {
  return mosquittoCommand(entry, brokerHost.value, directory.targetSite.value || 'magicmirror')
}

async function play(entry: MotionDirectoryEntry) {
  notice.value = await directory.send(entry.action, entry.payload)
    ? `Enviado: ${entry.name}`
    : 'Sem conexão com o broker. Configure a ponte NeoAlice em Configurações, ou use o comando da linha.'
}

async function copy(entry: MotionDirectoryEntry) {
  await navigator.clipboard?.writeText(commandOf(entry)).catch(() => {})
  notice.value = `Comando copiado: ${entry.name}`
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div :class="['min-h-full', 'bg-neutral-50', 'p-4', 'text-neutral-800', 'dark:bg-neutral-900', 'dark:text-neutral-100']">
    <h1 :class="['mb-1', 'text-xl', 'font-semibold']">
      Movimentos da avatar
    </h1>
    <p :class="['mb-3', 'text-sm', 'opacity-75']">
      {{ entries.length }} movimentos. Broker: {{ directory.status.value === 'connected' ? 'conectado' : directory.status.value === 'connecting' ? 'conectando' : 'sem conexão' }}.
      Site do espelho: {{ directory.targetSite.value || 'magicmirror' }}.
    </p>
    <div :class="['mb-3', 'flex', 'flex-wrap', 'gap-2']">
      <input
        v-model="filter"
        data-testid="motions-filter"
        placeholder="Filtrar por nome ou descrição"
        :class="['min-w-60', 'flex-1', 'rounded', 'border', 'border-neutral-300', 'bg-white', 'px-2', 'py-1', 'dark:border-neutral-700', 'dark:bg-neutral-800']"
      >
      <button :class="['rounded', 'bg-primary-500', 'px-3', 'py-1', 'text-white']" @click="download('avatar-rig.json', avatarRigDownload())">
        Baixar banco de ossos e rosto
      </button>
      <button :class="['rounded', 'bg-primary-500', 'px-3', 'py-1', 'text-white']" @click="download('movimentos.json', { version: 1, motions: directory.customMotions.value })">
        Baixar movimentos criados
      </button>
    </div>
    <p v-if="notice" :class="['mb-2', 'text-sm']">
      {{ notice }}
    </p>
    <table :class="['w-full', 'border-collapse', 'text-sm']">
      <thead>
        <tr :class="['text-left']">
          <th :class="['p-1']">
            Nome
          </th>
          <th :class="['p-1']">
            Tipo
          </th>
          <th :class="['p-1']">
            Origem
          </th>
          <th :class="['p-1']">
            Descrição
          </th>
          <th :class="['p-1']">
            Comando
          </th>
          <th :class="['p-1']" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in shown" :key="`${entry.group}:${entry.name}`" data-testid="motion-row" :class="['border-t', 'border-neutral-200', 'dark:border-neutral-700']">
          <td :class="['p-1', 'font-mono']">
            {{ entry.name }}
          </td>
          <td :class="['p-1']">
            {{ groupNames[entry.group] }}
          </td>
          <td :class="['p-1']">
            {{ entry.origin }}
          </td>
          <td :class="['p-1']">
            {{ entry.description }}
          </td>
          <td :class="['p-1', 'font-mono', 'text-xs', 'break-all']">
            {{ commandOf(entry) }}
          </td>
          <td :class="['p-1', 'whitespace-nowrap']">
            <button :class="['mr-1', 'rounded', 'bg-primary-500', 'px-2', 'py-0.5', 'text-white']" @click="play(entry)">
              Tocar
            </button>
            <button :class="['rounded', 'border', 'border-neutral-400', 'px-2', 'py-0.5']" @click="copy(entry)">
              Copiar
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<route lang="yaml">
name: MotionsPage
meta:
  layout: plain
  onboarding: false
</route>
