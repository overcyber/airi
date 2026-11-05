<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  retry: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    data-testid="webgl-unavailable"
    :class="[
      'absolute inset-0 z-20 p-6',
      'flex items-center justify-center',
      'bg-white/45 dark:bg-black/45 backdrop-blur-sm',
    ]"
  >
    <div :class="['max-w-xl w-full flex flex-col gap-3 px-1']">
      <h2 :class="['text-lg font-semibold text-neutral-900 dark:text-neutral-100']">
        {{ t('stage.webgl-unavailable.title') }}
      </h2>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-300']">
        {{ t('stage.webgl-unavailable.description') }}
      </p>
      <ul :class="['text-sm text-neutral-600 dark:text-neutral-300 list-disc pl-5 flex flex-col gap-1']">
        <li>{{ t('stage.webgl-unavailable.step-tabs') }}</li>
        <li>{{ t('stage.webgl-unavailable.step-restart') }}</li>
        <li>{{ t('stage.webgl-unavailable.step-gpu') }}</li>
      </ul>
      <div>
        <Button @click="emit('retry')">
          {{ t('stage.webgl-unavailable.retry') }}
        </Button>
      </div>
    </div>
  </div>
</template>
