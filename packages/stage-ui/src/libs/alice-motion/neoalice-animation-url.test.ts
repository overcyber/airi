import { describe, expect, it } from 'vitest'

import { resolveNeoAliceAnimationUrl } from './neoalice-animation-url'

const server = 'https://192.0.2.20'

describe('resolveNeoAliceAnimationUrl', () => {
  it('loads the TalkingHead folders from the Alice server, at the same path', () => {
    expect(resolveNeoAliceAnimationUrl({ url: 'http://192.0.2.10:8081/poses/dance.fbx' }, server)).toBe('https://192.0.2.20/poses/dance.fbx')
    expect(resolveNeoAliceAnimationUrl({ url: 'http://localhost:8081/animations_arkit/Wave_Hello.fbx' }, server)).toBe('https://192.0.2.20/animations_arkit/Wave_Hello.fbx')
    expect(resolveNeoAliceAnimationUrl({ url: 'http://localhost:8081/animations/Rumba%20Dancing.fbx' }, server)).toBe('https://192.0.2.20/animations/Rumba%20Dancing.fbx')
    expect(resolveNeoAliceAnimationUrl({ url: 'animations/Talking_1.fbx' }, server)).toBe('https://192.0.2.20/animations/Talking_1.fbx')
  })

  it('keeps another HTTP URL, and refuses what is not HTTP', () => {
    expect(resolveNeoAliceAnimationUrl({ url: 'https://example.com/x/backflip.fbx' }, server)).toBe('https://example.com/x/backflip.fbx')
    expect(resolveNeoAliceAnimationUrl({ url: 'javascript:alert(1)' }, server)).toBeUndefined()
  })

  it('finds the file of a TalkingHead animation name', () => {
    expect(resolveNeoAliceAnimationUrl({ name: 'Wave' }, server)).toBe('https://192.0.2.20/animations_arkit/Wave_Hello.fbx')
    expect(resolveNeoAliceAnimationUrl({ name: 'LookAround' }, server)).toBe('https://192.0.2.20/animations_arkit/Look_Around.fbx')
    expect(resolveNeoAliceAnimationUrl({ name: 'Moonwalk' }, server)).toBeUndefined()
  })
})
