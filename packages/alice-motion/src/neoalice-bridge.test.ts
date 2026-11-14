import { describe, expect, it } from 'vitest'

import { MotionCatalog } from './catalog'
import { neoAliceBridgeTopics, NeoAliceTranslator } from './neoalice-bridge'
import { neoAliceToolResultEvent } from './neoalice-satellite'

const catalog = new MotionCatalog()

function translator(options: { acceptAnySite?: boolean, moodSite?: string, vision?: boolean } = {}) {
  return new NeoAliceTranslator({ site: 'mirror', catalog, ...options })
}

const at = (seconds: number) => seconds * 1000
/** A smiling face, written as an escape so the source has no emoji. */
const smile = '\u{1F60A}'

describe('neoAliceBridgeTopics', () => {
  it('lists only read topics of the bridge site and of the companion', () => {
    const topics = neoAliceBridgeTopics({ site: 'mirror' })

    expect(topics).toContain('neoalice/v1/mirror/cmd/tts/say')
    expect(topics).toContain('neoalice/v1/companion/evt/companion/state')
    expect(topics.every(topic => topic.startsWith('neoalice/v1/mirror/') || topic.startsWith('neoalice/v1/companion/'))).toBe(true)
    expect(neoAliceBridgeTopics({ site: 'mirror', acceptAnySite: true })[0]).toBe('neoalice/v1/+/cmd/tts/say')
  })
})

describe('neoAliceTranslator', () => {
  it('reads the speech text the way the mirror module does', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', JSON.stringify({ text: 'Oi!', lang: 'pt-BR', session_id: 's1' }), 0))
      .toEqual({ type: 'speech-text', site: 'mirror', text: 'Oi!', lang: 'pt-BR', sessionId: 's1' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', JSON.stringify({ tts: { text: 'Tudo bem?', lang: 'pt-BR' } }), 0))
      .toMatchObject({ type: 'speech-text', text: 'Tudo bem?', lang: 'pt-BR' })
  })

  it('reads speech audio from audio.b64 or audio_base64', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/audio', JSON.stringify({ audio: { b64: 'UklGRg==' }, text: 'Oi', session_id: 's2' }), 0))
      .toEqual({ type: 'speech-audio', site: 'mirror', audioBase64: 'UklGRg==', text: 'Oi', sessionId: 's2' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/audio', JSON.stringify({ audio_base64: 'AAAA' }), 0))
      .toMatchObject({ type: 'speech-audio', audioBase64: 'AAAA' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/audio', JSON.stringify({ text: 'sem audio' }), 0))
      .toEqual({ type: 'ignored', topic: 'neoalice/v1/mirror/cmd/tts/audio', reason: 'no audio' })
  })

  it('reads stop, the final transcript, and both mood topics with the shared mood table', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/stop', '{}', 0)).toEqual({ type: 'speech-stop', site: 'mirror' })
    expect(bridge.translate('neoalice/v1/mirror/evt/stt/final', JSON.stringify({ text: 'oi alice' }), 0)).toEqual({ type: 'user-speech', site: 'mirror', text: 'oi alice' })
    expect(bridge.translate('neoalice/v1/mirror/evt/mood', JSON.stringify({ mood: 'Playful', intensity: 80 }), 0))
      .toMatchObject({ type: 'mood', origin: 'neoalice', intensity: 0.8, mood: { primary: 'playful', airiEmotion: 'happy' } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/evt/mood', JSON.stringify({ state: { mood: 'melancholic' } }), 0))
      .toMatchObject({ type: 'mood', mood: { airiEmotion: 'sad' } })
  })

  it('turns gestures, poses, and emojis into catalog intents, and animations into animation events', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', JSON.stringify({ gesture: 'thumbup', duration: 3 }), 0))
      .toMatchObject({ type: 'intent', intent: { semanticAction: 'gesture_thumbup', requestedDurationMs: 3000, source: 'llm' } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', JSON.stringify({ name: 'wave', source: 'vision' }), 0))
      .toMatchObject({ type: 'intent', intent: { semanticAction: 'gesture_wave', source: 'vision' } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', JSON.stringify({ gesture: 'wave', duration: 4, mirror: true }), 0))
      .toMatchObject({ type: 'intent', intent: { semanticAction: 'gesture_wave_mirror', requestedDurationMs: 4000 } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', JSON.stringify({ gesture: 'namaste', duration: 6 }), 0))
      .toMatchObject({ type: 'intent', intent: { semanticAction: 'gesture_namaste', requestedDurationMs: 6000 } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/pose', JSON.stringify({ pose: 'straight' }), 0))
      .toMatchObject({ type: 'intent', intent: { semanticAction: 'pose_straight', requestedChannels: ['posture'] } })
    for (const pose of ['arms_open', 'bow', 'thinking', 'sitting', 'lying', 'lie_down'])
      expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/pose', JSON.stringify({ pose }), 0)).toMatchObject({ type: 'intent', intent: { semanticAction: `pose_${pose}` } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/animation', JSON.stringify({ url: 'http://192.0.2.10:8081/poses/dance.fbx', duration: 15 }), 0))
      .toEqual({ type: 'animation', site: 'mirror', url: 'http://192.0.2.10:8081/poses/dance.fbx', durationMs: 15_000 })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/emoji', JSON.stringify({ emoji: smile }), 0))
      .toMatchObject({ type: 'intent', emoji: smile, intent: { semanticAction: 'emoji', requestedChannels: ['facial'] } })
  })

  it('gives each intent a new ID', () => {
    const bridge = translator()
    const first = bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', '{"gesture":"ok"}', at(0))
    const second = bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', '{"gesture":"ok"}', at(5))

    expect(first.type === 'intent' && second.type === 'intent' && first.intent.id !== second.intent.id).toBe(true)
  })

  it('reads a TalkingHead animation name when the message has no url', () => {
    expect(translator().translate('neoalice/v1/mirror/cmd/avatar/animation', '{"name":"Wave","duration":5}', 0))
      .toEqual({ type: 'animation', site: 'mirror', name: 'Wave', durationMs: 5000 })
  })

  it('refuses an animation without url or name, and an unknown gesture, with a reason', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/animation', '{"duration":5}', 0))
      .toEqual({ type: 'ignored', topic: 'neoalice/v1/mirror/cmd/avatar/animation', reason: 'no animation url or name' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', '{"gesture":"moonwalk"}', 0)).toMatchObject({ type: 'ignored' })
  })

  it('ignores other sites, repeated payloads, broken JSON, and oversized commands without throwing', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/kitchen/cmd/tts/say', '{"text":"x"}', 0)).toMatchObject({ type: 'ignored', reason: 'site "kitchen" is not the bridge site' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', '{"text":"x"}', at(1)).type).toBe('speech-text')
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', '{"text":"x"}', at(2))).toMatchObject({ type: 'ignored', reason: 'repeated payload' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', '{"text":"x"}', at(4)).type).toBe('speech-text')
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', '{not json', 0)).toMatchObject({ type: 'ignored', reason: 'payload is not JSON' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', JSON.stringify({ gesture: 'ok', note: 'x'.repeat(5000) }), 0))
      .toMatchObject({ type: 'ignored', reason: 'message is larger than 4096 bytes' })
    expect(bridge.translate('hermes/tts/say', '{}', 0)).toMatchObject({ type: 'ignored', reason: 'not a NeoAlice v1 topic' })
    expect(translator({ acceptAnySite: true }).translate('neoalice/v1/kitchen/cmd/tts/say', '{"text":"x"}', 0).type).toBe('speech-text')
  })

  it('reads the mood of the companion state and affect', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/companion/evt/companion/state', JSON.stringify({ mood: { primary: 'cozy', airiEmotion: 'happy', intensity: 40 } }), 0))
      .toMatchObject({ type: 'mood', origin: 'companion', intensity: 0.4, mood: { primary: 'cozy', airiEmotion: 'happy' } })
    expect(bridge.translate('neoalice/v1/companion/evt/companion/affect', JSON.stringify({ emotion: 'annoyed', airiEmotion: 'angry' }), 0))
      .toMatchObject({ type: 'mood', mood: { airiEmotion: 'angry' } })
    expect(bridge.translate('neoalice/v1/companion/evt/companion/state', JSON.stringify({ mood: null }), 0)).toMatchObject({ type: 'ignored' })
  })

  it('reads the bond of the companion state, also without a mood', () => {
    const state = { mood: null, metrics: { affection: 800, trust: 70, intimacy: 60, comfort: 90, respect: 80 }, energy: { value: 30 } }
    expect(translator().translate('neoalice/v1/companion/evt/companion/state', JSON.stringify(state), 0))
      .toEqual({ type: 'bond', site: 'companion', bond: { warmth: 0.767, trust: 0.7, energy: 0.3 } })
    const withMood = { ...state, mood: { primary: 'happy', airiEmotion: 'happy', intensity: null } }
    expect(translator().translate('neoalice/v1/companion/evt/companion/state', JSON.stringify(withMood), 0))
      .toMatchObject({ type: 'mood', mood: { airiEmotion: 'happy' }, bond: { warmth: 0.767 } })
  })

  it('reads the mood and the avatar commands of the mood site, but not its speech', () => {
    const bridge = translator({ moodSite: 'magicmirror' })
    expect(neoAliceBridgeTopics({ site: 'mirror', moodSite: 'magicmirror' })).toContain('neoalice/v1/magicmirror/evt/mood')
    expect(neoAliceBridgeTopics({ site: 'mirror', moodSite: 'magicmirror' })).not.toContain('neoalice/v1/magicmirror/cmd/tts/audio')

    expect(bridge.translate('neoalice/v1/magicmirror/evt/mood', '{"mood":"happy"}', 0).type).toBe('mood')
    expect(bridge.translate('neoalice/v1/magicmirror/cmd/avatar/gesture', '{"gesture":"wave"}', 0).type).toBe('intent')
    expect(bridge.translate('neoalice/v1/magicmirror/cmd/tts/say', '{"text":"oi"}', 0).type).toBe('ignored')
  })

  it('reads the final transcript of the v1 message in stt.text', () => {
    expect(translator().translate('neoalice/v1/mirror/evt/stt/final', JSON.stringify({ v: 1, type: 'evt.stt.final', stt: { text: 'que horas sao', lang: 'pt' } }), 0))
      .toEqual({ type: 'user-speech', site: 'mirror', text: 'que horas sao' })
  })

  it('reads people on the cameras and the face recognition greeting, only with vision on (F5)', () => {
    const topics = neoAliceBridgeTopics({ site: 'mirror', vision: true })
    expect(topics).toContain('neoalice/v1/+/evt/vision/detections')
    expect(topics).toContain('neoalice/v1/facialrecog/evt/stt/final')
    expect(neoAliceBridgeTopics({ site: 'mirror' }).some(topic => topic.includes('vision'))).toBe(false)

    const bridge = translator({ vision: true })
    const core = { v: 1, type: 'evt.vision.detection', detection: { camera: 'cam-entrada', objects: [{ class: 'person', confidence: 0.93 }, { class: 'person' }] } }
    expect(bridge.translate('neoalice/v1/vision-entrada/evt/vision/detection', JSON.stringify(core), 0))
      .toEqual({ type: 'presence', site: 'vision-entrada', people: 2, camera: 'cam-entrada' })
    const satellite = { v: 1, type: 'evt.vision.detections', camera: 'cam-sala', detections: [{ class_name: 'person', confidence: 0.94 }, { class_name: 'cell phone' }] }
    expect(bridge.translate('neoalice/v1/vision-sala/evt/vision/detections', JSON.stringify(satellite), 0))
      .toEqual({ type: 'presence', site: 'vision-sala', people: 1, camera: 'cam-sala' })
    expect(bridge.translate('neoalice/v1/vision-sala/evt/vision/detections', JSON.stringify({ detections: [{ class_name: 'cat' }] }), 0))
      .toMatchObject({ type: 'ignored', reason: 'no person in the vision message' })
    expect(bridge.translate('neoalice/v1/facialrecog/evt/stt/final', JSON.stringify({ stt: { text: 'Ola Ana' } }), 0))
      .toEqual({ type: 'greeting', site: 'facialrecog', text: 'Ola Ana' })

    expect(translator().translate('neoalice/v1/vision-sala/evt/vision/detections', JSON.stringify(satellite), 0))
      .toMatchObject({ type: 'ignored' })
  })
})

describe('neoAliceTranslator speech of the mirror site', () => {
  it('plays what Alice says on the mirror site when the avatar is the mirror, once per broadcast', () => {
    const topics = neoAliceBridgeTopics({ site: 'airi-avatar', moodSite: 'magicmirror', moodSiteSpeech: true })
    expect(topics).toContain('neoalice/v1/magicmirror/cmd/tts/audio')
    expect(neoAliceBridgeTopics({ site: 'airi-avatar', moodSite: 'magicmirror' })).not.toContain('neoalice/v1/magicmirror/cmd/tts/audio')

    const bridge = new NeoAliceTranslator({ site: 'airi-avatar', moodSite: 'magicmirror', moodSiteSpeech: true, catalog })
    const speech = JSON.stringify({ audio: { b64: 'UklGRg==' }, tts: { text: 'Ola, bem-vindo' }, session_id: 'greet-1' })
    expect(bridge.translate('neoalice/v1/magicmirror/cmd/tts/audio', speech, 0)).toMatchObject({ type: 'speech-audio', site: 'magicmirror', text: 'Ola, bem-vindo' })
    // The same broadcast also comes on the site of the avatar. It plays once.
    expect(bridge.translate('neoalice/v1/airi-avatar/cmd/tts/audio', speech, 100)).toMatchObject({ type: 'ignored', reason: 'the same speech came on another site' })
    expect(bridge.translate('neoalice/v1/magicmirror/cmd/tts/stop', '{}', 200)).toMatchObject({ type: 'speech-stop' })

    // ROOT CAUSE:
    //
    // NeoAlice sent the same speech to each site with its own session id, so the avatar spoke it several times.
    //
    // We fixed this by also matching the text of the speech.
    const copy = (session: string) => JSON.stringify({ audio: { b64: 'UklGRg==' }, text: 'Hoje faz sol.', session_id: session })
    expect(bridge.translate('neoalice/v1/magicmirror/cmd/tts/audio', copy('mirror-7'), 1000)).toMatchObject({ type: 'speech-audio' })
    expect(bridge.translate('neoalice/v1/airi-avatar/cmd/tts/audio', copy('avatar-7'), 1100)).toMatchObject({ type: 'ignored' })

    const off = new NeoAliceTranslator({ site: 'airi-avatar', moodSite: 'magicmirror', catalog })
    expect(off.translate('neoalice/v1/magicmirror/cmd/tts/audio', speech, 0)).toMatchObject({ type: 'ignored' })
  })
})

describe('neoAliceTranslator widgets and tools (Plan 07, W4)', () => {
  it('reads widget and tool commands of the avatar site and of the mirror site', () => {
    const topics = neoAliceBridgeTopics({ site: 'airi-avatar', moodSite: 'magicmirror' })
    expect(topics).toEqual(expect.arrayContaining(['neoalice/v1/airi-avatar/cmd/avatar/widget', 'neoalice/v1/airi-avatar/cmd/avatar/tool', 'neoalice/v1/magicmirror/cmd/avatar/widget']))

    const bridge = new NeoAliceTranslator({ site: 'airi-avatar', moodSite: 'magicmirror', catalog })
    expect(bridge.translate('neoalice/v1/airi-avatar/cmd/avatar/widget', JSON.stringify({ action: 'spawn', widget: 'weather', props: { city: 'Sao Paulo' }, ttl_s: 30 }), 0))
      .toEqual({ type: 'widget', site: 'airi-avatar', action: 'spawn', widget: 'weather', props: { city: 'Sao Paulo' }, ttlSeconds: 30 })
    expect(bridge.translate('neoalice/v1/magicmirror/cmd/avatar/widget', '{"action":"clear"}', 0)).toMatchObject({ type: 'widget', action: 'clear' })
    expect(bridge.translate('neoalice/v1/airi-avatar/cmd/avatar/widget', '{"action":"spawn"}', 0)).toMatchObject({ type: 'ignored', reason: 'a widget spawn needs a widget name' })
    expect(bridge.translate('neoalice/v1/airi-avatar/cmd/avatar/tool', JSON.stringify({ tool: 'get_weather', args: { city: 'Rio' }, request_id: 'r1' }), 0))
      .toEqual({ type: 'tool', site: 'airi-avatar', tool: 'get_weather', args: { city: 'Rio' }, requestId: 'r1' })
  })

  it('builds the evt/avatar/tool_result answer', () => {
    const ok = neoAliceToolResultEvent({ site: 'airi-avatar', requestId: 'r1', tool: 'get_weather', ok: true, result: { temp: 25 }, nowMs: 0 })
    expect(ok.topic).toBe('neoalice/v1/airi-avatar/evt/avatar/tool_result')
    expect(JSON.parse(ok.payload)).toMatchObject({ type: 'evt.avatar.tool_result', request_id: 'r1', ok: true, result: { temp: 25 } })
    const refused = neoAliceToolResultEvent({ site: 'airi-avatar', requestId: 'r2', tool: 'computer_use', ok: false, error: 'not permitted', nowMs: 0 })
    expect(JSON.parse(refused.payload)).toMatchObject({ ok: false, error: 'not permitted' })
  })
})

describe('neoAliceTranslator night mode and person position', () => {
  it('reads the night mode of Alice on the bridge site and the mood site, and it is not the sleepy mood', () => {
    expect(neoAliceBridgeTopics({ site: 'airi-avatar', moodSite: 'magicmirror' })).toEqual(expect.arrayContaining([
      'neoalice/v1/airi-avatar/evt/alice/night_mode',
      'neoalice/v1/magicmirror/evt/alice/night_mode',
    ]))
    const bridge = translator({ moodSite: 'magicmirror' })
    expect(bridge.translate('neoalice/v1/magicmirror/evt/alice/night_mode', JSON.stringify({ active: true }), 0))
      .toEqual({ type: 'night-mode', site: 'magicmirror', active: true })
    expect(bridge.translate('neoalice/v1/mirror/evt/alice/night_mode', JSON.stringify({ state: 'off' }), 0))
      .toEqual({ type: 'night-mode', site: 'mirror', active: false })
    expect(bridge.translate('neoalice/v1/mirror/evt/alice/night_mode', JSON.stringify({ mode: 'x' }), 5000))
      .toMatchObject({ type: 'ignored', reason: 'no night mode state' })
    expect(bridge.translate('neoalice/v1/mirror/evt/mood', JSON.stringify({ mood: 'sleep' }), 0))
      .toMatchObject({ type: 'mood', mood: { airiEmotion: 'sleepy', talkingheadMood: 'sleep' } })
  })

  it('gives the center of the largest person box, and no target without a valid box', () => {
    const bridge = translator({ vision: true })
    const message = { detection: { camera: 'cam-espelho', objects: [
      { class: 'person', bbox: { x: 0.1, y: 0.2, w: 0.1, h: 0.2 } },
      { class: 'person', bbox: { x: 0.5, y: 0.1, w: 0.3, h: 0.6 } },
      { class: 'person', bbox: { x: 40, y: 10, w: 100, h: 200 } },
    ] } }
    const event = bridge.translate('neoalice/v1/vision-espelho/evt/vision/detection', JSON.stringify(message), 0)
    expect(event).toMatchObject({ type: 'presence', people: 3, camera: 'cam-espelho' })
    if (event.type !== 'presence')
      return
    expect(event.target?.x).toBeCloseTo(0.65)
    expect(event.target?.y).toBeCloseTo(0.4)
    expect(bridge.translate('neoalice/v1/vision-sala/evt/vision/detections', JSON.stringify({ detections: [{ class_name: 'person' }] }), 0))
      .not
      .toHaveProperty('target')
  })
})
