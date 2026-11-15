<script setup lang="ts">
import type { WakeWord } from '@proj-airi/stage-ui/libs/voice/wake-words'

import { errorMessageFrom } from '@moeru/std'
import { kwsVocabulary, kwsVocabularyModel } from '@proj-airi/stage-ui/libs/voice/kws-model'
import { parsePronunciation, suggestPronunciations } from '@proj-airi/stage-ui/libs/voice/wake-word-pronunciation'
import { useWakeWordsStore } from '@proj-airi/stage-ui/stores/wake-words'
import { Button, FieldInput } from '@proj-airi/ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  characterId: string
  /** The wake words that the card has now. */
  words: readonly WakeWord[]
}>()

const { t } = useI18n()
const wakeWords = useWakeWordsStore()

const text = ref('')
/** One pronunciation on each line, tokens separated by spaces. */
const pronunciations = ref('')
const busy = ref(false)
const error = ref('')
const saved = ref(false)

function suggest() {
  error.value = ''
  saved.value = false
  const suggestions = suggestPronunciations(text.value, kwsVocabulary)
  if (suggestions.length === 0) {
    error.value = t('settings.pages.modules.hearing.wake-words.editor.no-suggestion')
    return
  }
  pronunciations.value = suggestions.map(suggestion => suggestion.tokens.join(' ')).join('\n')
}

async function add() {
  error.value = ''
  saved.value = false
  const word = text.value.trim()
  const lines = pronunciations.value.split('\n').map(parsePronunciation).filter(tokens => tokens.length > 0)
  if (word === '' || lines.length === 0) {
    error.value = t('settings.pages.modules.hearing.wake-words.editor.incomplete')
    return
  }
  busy.value = true
  try {
    // The same text replaces the old word, so adding a word again changes its pronunciations.
    const others = props.words.filter(item => item.text.toLowerCase() !== word.toLowerCase())
    await wakeWords.setWords(props.characterId, [...others, { text: word, modelId: kwsVocabularyModel.id, pronunciations: lines }], kwsVocabularyModel)
    text.value = ''
    pronunciations.value = ''
    saved.value = true
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('settings.pages.modules.hearing.wake-words.editor.failed')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div data-testid="wake-word-editor" :class="['flex flex-col gap-2']">
    <h3 :class="['text-sm font-medium text-neutral-700 dark:text-neutral-200']">
      {{ t('settings.pages.modules.hearing.wake-words.editor.title') }}
    </h3>
    <FieldInput
      v-model="text"
      :label="t('settings.pages.modules.hearing.wake-words.editor.word')"
      :description="t('settings.pages.modules.hearing.wake-words.editor.word-description')"
      placeholder="Eva"
      data-testid="wake-word-text"
    />
    <label :class="['flex flex-col gap-1 text-sm']">
      <span :class="['font-medium text-neutral-700 dark:text-neutral-200']">{{ t('settings.pages.modules.hearing.wake-words.editor.pronunciation') }}</span>
      <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ t('settings.pages.modules.hearing.wake-words.editor.pronunciation-description') }}</span>
      <textarea
        v-model="pronunciations"
        rows="3"
        data-testid="wake-word-pronunciations"
        placeholder="EH1 V AH0"
        :class="['w-full rounded-lg px-3 py-2 font-mono text-xs', 'bg-neutral-100 dark:bg-neutral-800/60']"
      />
    </label>
    <div :class="['flex flex-wrap gap-2']">
      <Button :disabled="busy || text.trim() === ''" variant="secondary" data-testid="wake-word-suggest" @click="suggest">
        {{ t('settings.pages.modules.hearing.wake-words.editor.suggest') }}
      </Button>
      <Button :disabled="busy" data-testid="wake-word-add" @click="add">
        {{ t('settings.pages.modules.hearing.wake-words.editor.add') }}
      </Button>
    </div>
    <p v-if="error" role="alert" :class="['text-sm text-red-500']">
      {{ error }}
    </p>
    <p v-else-if="saved" :class="['text-sm text-emerald-600 dark:text-emerald-400']">
      {{ t('settings.pages.modules.hearing.wake-words.editor.saved') }}
    </p>
  </div>
</template>
