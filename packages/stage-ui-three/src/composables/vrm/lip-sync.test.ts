import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import { useVRMLipSync } from './lip-sync'

const lipSyncNode = vi.hoisted(() => ({
  disconnect: vi.fn(),
  volume: 1,
  weights: { A: 1 },
}))

vi.mock('@proj-airi/model-driver-lipsync/runtime/wlipsync', () => ({
  createWLipSyncNode: vi.fn(async () => lipSyncNode),
}))

describe('useVRMLipSync', () => {
  it('does not clear visemes when lip sync never owned the mouth', () => {
    const speechActive = shallowRef(false)
    const setValue = vi.fn()
    const scope = effectScope()
    const lipSync = scope.run(() => useVRMLipSync(shallowRef(undefined), shallowRef(undefined), speechActive))!
    // eslint-disable-next-line slop/no-chained-type-assertions
    const vrm = { expressionManager: { setValue, getExpression: () => null, getValue: () => 0 } } as unknown as Parameters<typeof lipSync.update>[0]

    lipSync.update(vrm, 0.016)

    expect(setValue).not.toHaveBeenCalled()
    scope.stop()
  })

  it('zeroes visemes after lip sync owned the mouth and speech becomes inactive', async () => {
    const speechActive = shallowRef(true)
    const setValue = vi.fn()
    const scope = effectScope()
    const lipSync = scope.run(() => useVRMLipSync(shallowRef({} as AudioContext), shallowRef(undefined), speechActive))!
    // eslint-disable-next-line slop/no-chained-type-assertions
    const vrm = { expressionManager: { setValue, getExpression: () => null, getValue: () => 0 } } as unknown as Parameters<typeof lipSync.update>[0]

    await vi.waitFor(() => {
      lipSync.update(vrm, 0.016)
      expect(setValue).toHaveBeenCalled()
    })
    setValue.mockClear()

    speechActive.value = false
    lipSync.update(vrm, 0.016)

    expect(setValue).toHaveBeenCalledWith('aa', 0)
    expect(setValue).toHaveBeenCalledWith('ou', 0)
    scope.stop()
  })

  it('opens the mouth wide on a loud syllable and closes it in a quieter gap', async () => {
    // ROOT CAUSE:
    //
    // The node volume stayed at 1 for all TTS speech, and `aa` stopped at 0.49. The VRM lips hardly moved.
    //
    // We fixed this with a speech envelope and a mouth opening setting (default 0.6).
    const values = new Map<string, number>()
    const setValue = vi.fn((name: string, value: number) => void values.set(name, value))
    const scope = effectScope()
    const mouthOpening = shallowRef<number | undefined>(undefined)
    const lipSync = scope.run(() => useVRMLipSync(shallowRef({} as AudioContext), shallowRef(undefined), shallowRef(true), { mouthOpening }))!
    const expressionManager = { setValue, getExpression: () => null, getValue: (name: string) => values.get(name) ?? 0 }
    // eslint-disable-next-line slop/no-chained-type-assertions
    const vrm = { expressionManager } as unknown as Parameters<typeof lipSync.update>[0]

    // A stressed syllable: RMS 0.1, that is log10 -1.
    lipSyncNode.volume = 2 / 3
    await vi.waitFor(() => {
      lipSync.update(vrm, 0.016)
      expect(setValue).toHaveBeenCalled()
    })
    for (let frame = 0; frame < 30; frame++)
      lipSync.update(vrm, 0.016)
    expect(values.get('aa')).toBeCloseTo(0.6, 1)
    expect(values.has('jawOpen')).toBe(false)

    // The mouth opening setting applies in the next frame.
    mouthOpening.value = 0.9
    lipSync.update(vrm, 0.016)
    expect(values.get('aa')).toBeCloseTo(0.9, 1)

    // A gap 15 dB under the syllable: the mouth closes.
    lipSyncNode.volume = 1.25 / 3
    for (let frame = 0; frame < 30; frame++)
      lipSync.update(vrm, 0.016)
    expect(values.get('aa')).toBeLessThan(0.05)

    lipSyncNode.volume = 1
    scope.stop()
  })

  it('closes the lips on p and opens them on the vowel of the Portuguese text', async () => {
    // ROOT CAUSE:
    //
    // The audio vowels never close the lips, so speech did not look like Portuguese. TalkingHead read the text.
    //
    // We fixed this with a text track of Brazilian Portuguese mouth shapes that follows the voice of the audio.
    const values = new Map<string, number>()
    const setValue = vi.fn((name: string, value: number) => void values.set(name, value))
    const expressionManager = { setValue, getExpression: () => null, getValue: (name: string) => values.get(name) ?? 0 }
    // eslint-disable-next-line slop/no-chained-type-assertions
    const vrm = { expressionManager } as unknown as Parameters<ReturnType<typeof useVRMLipSync>['update']>[0]
    const speechText = shallowRef<{ id: number, text: string }>()
    const scope = effectScope()
    const lipSync = scope.run(() => useVRMLipSync(shallowRef({} as AudioContext), shallowRef(undefined), shallowRef(true), { speechText }))!
    lipSyncNode.volume = 2 / 3
    await vi.waitFor(() => {
      lipSync.update(vrm, 0.016)
      expect(setValue).toHaveBeenCalled()
    })

    speechText.value = { id: 1, text: 'papapapa' }
    await nextTick()
    const mouth: number[] = []
    for (let frame = 0; frame < 40; frame++) {
      lipSync.update(vrm, 0.016)
      mouth.push(values.get('aa') ?? 0)
    }

    // Each p closes the mouth, and each a opens it.
    expect(Math.min(...mouth.slice(5))).toBeLessThan(0.1)
    expect(Math.max(...mouth)).toBeGreaterThan(0.3)
    lipSyncNode.volume = 1
    scope.stop()
  })

  it('connects its node to the played speech and moves it to a new connection', async () => {
    // ROOT CAUSE:
    //
    // The renderer received each played source node through a prop and kept only the newest one.
    // Overlapping streamed parts were missed, and the mouth read the audio before the clip fade.
    //
    // We fixed this by connecting the node once to the playback mix.
    const firstDisconnect = vi.fn()
    const secondDisconnect = vi.fn()
    const first = vi.fn(() => firstDisconnect)
    const second = vi.fn(() => secondDisconnect)
    const connectSpeech = shallowRef<(node: AudioNode) => () => void>(first)
    const scope = effectScope()
    scope.run(() => useVRMLipSync(shallowRef({} as AudioContext), connectSpeech, shallowRef(true)))

    await vi.waitFor(() => expect(first).toHaveBeenCalledWith(lipSyncNode))

    connectSpeech.value = second
    await nextTick()
    expect(firstDisconnect).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith(lipSyncNode)

    scope.stop()
    expect(secondDisconnect).toHaveBeenCalledOnce()
  })
})
