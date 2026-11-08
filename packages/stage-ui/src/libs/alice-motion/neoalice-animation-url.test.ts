import { describe, expect, it } from 'vitest'

import { resolveNeoAliceAnimationUrls } from './neoalice-animation-url'

const server = 'https://192.0.2.20'

describe('resolveNeoAliceAnimationUrls', () => {
  it('tries the TalkingHead folders on the Alice server first, then the URL of the message', () => {
    // ROOT CAUSE:
    //
    // The desktop app loaded only the Alice server URL. When the saved server did not serve /poses/,
    // the animation failed, although the TalkingHead server sends CORS headers.
    //
    // We fixed this by trying the URL of the message after the Alice server.
    expect(resolveNeoAliceAnimationUrls({ url: 'http://192.0.2.10:8081/poses/dance.fbx' }, server)).toEqual(['https://192.0.2.20/poses/dance.fbx', 'http://192.0.2.10:8081/poses/dance.fbx'])
    expect(resolveNeoAliceAnimationUrls({ url: 'http://localhost:8081/animations_arkit/Wave_Hello.fbx' }, server)).toEqual(['https://192.0.2.20/animations_arkit/Wave_Hello.fbx', 'http://localhost:8081/animations_arkit/Wave_Hello.fbx'])
    expect(resolveNeoAliceAnimationUrls({ url: 'http://localhost:8081/animations/Rumba%20Dancing.fbx' }, server)[0]).toBe('https://192.0.2.20/animations/Rumba%20Dancing.fbx')
    expect(resolveNeoAliceAnimationUrls({ url: 'animations/Talking_1.fbx' }, server)).toEqual(['https://192.0.2.20/animations/Talking_1.fbx'])
  })

  it('uses the URL of the message without an Alice server', () => {
    expect(resolveNeoAliceAnimationUrls({ url: 'http://192.0.2.10:8081/poses/dance.fbx' }, undefined)).toEqual(['http://192.0.2.10:8081/poses/dance.fbx'])
  })

  it('keeps another HTTP URL, and refuses what is not HTTP', () => {
    expect(resolveNeoAliceAnimationUrls({ url: 'https://example.com/x/backflip.fbx' }, server)).toEqual(['https://example.com/x/backflip.fbx'])
    expect(resolveNeoAliceAnimationUrls({ url: 'javascript:alert(1)' }, server)).toEqual([])
  })

  it('plays a motion that the app ships from the app, by file name or TalkingHead name', () => {
    const bundled = [{ name: 'Wave Hello', url: 'app://neoalice/wave-hello.fbx' }]
    expect(resolveNeoAliceAnimationUrls({ url: 'http://192.0.2.10:8081/animations_arkit/Wave_Hello.fbx' }, server, bundled)).toEqual(['app://neoalice/wave-hello.fbx'])
    expect(resolveNeoAliceAnimationUrls({ name: 'Wave' }, server, bundled)).toEqual(['app://neoalice/wave-hello.fbx'])
    expect(resolveNeoAliceAnimationUrls({ url: 'http://192.0.2.10:8081/animations/Rumba.fbx' }, server, bundled)[0]).toBe('https://192.0.2.20/animations/Rumba.fbx')
  })

  it('finds the file of a TalkingHead animation name', () => {
    expect(resolveNeoAliceAnimationUrls({ name: 'Wave' }, server)).toEqual(['https://192.0.2.20/animations_arkit/Wave_Hello.fbx'])
    expect(resolveNeoAliceAnimationUrls({ name: 'LookAround' }, server)).toEqual(['https://192.0.2.20/animations_arkit/Look_Around.fbx'])
    expect(resolveNeoAliceAnimationUrls({ name: 'Moonwalk' }, server)).toEqual([])
  })
})
