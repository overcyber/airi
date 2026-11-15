<script setup lang="ts">
import type { WakeWordFinding } from '../../../../libs/voice/wake-word-diagnostics'

import { useI18n } from 'vue-i18n'

const props = defineProps<{
  findings: readonly WakeWordFinding[]
  /** The place of the texts: `<prefix>.<id>.<ok|blocked|warning>`. */
  prefix: string
}>()

const { t } = useI18n()

const icons = {
  ok: 'i-solar:check-circle-line-duotone',
  blocked: 'i-solar:close-circle-line-duotone',
  warning: 'i-solar:danger-triangle-line-duotone',
} as const
const tones = {
  ok: ['text-emerald-600 dark:text-emerald-400'],
  blocked: ['text-red-500 dark:text-red-400'],
  warning: ['text-amber-600 dark:text-amber-400'],
} as const
</script>

<template>
  <ul data-testid="wake-word-checklist" :class="['flex flex-col gap-1.5']">
    <li
      v-for="item in props.findings"
      :key="item.id"
      :data-testid="`wake-word-check-${item.id}`"
      :data-status="item.status"
      :class="['flex items-start gap-2 text-sm', tones[item.status]]"
    >
      <span aria-hidden="true" :class="[icons[item.status], 'mt-0.5 size-4 shrink-0']" />
      <span>{{ t(`${props.prefix}.${item.id}.${item.status}`, item.params ?? {}) }}</span>
    </li>
  </ul>
</template>
