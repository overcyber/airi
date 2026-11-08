import { describe, expect, it } from 'vitest'

import { TextVisemeTrack } from './track'

describe('textVisemeTrack', () => {
  it('moves through the shapes while the audio has voice', () => {
    const track = new TextVisemeTrack([{ viseme: 'PP', units: 1 }, { viseme: 'aa', units: 1 }], 10)

    expect(track.update(0.05, true)).toMatchObject({ current: 'PP', next: 'aa', progress: 0.5, waiting: false })
    expect(track.update(0.06, true)?.current).toBe('aa')
    expect(track.update(0.1, true)).toBeNull()
    expect(track.finished).toBe(true)
  })

  it('holds a sound while the audio is silent', () => {
    const track = new TextVisemeTrack([{ viseme: 'aa', units: 1 }, { viseme: 'O', units: 1 }], 10)
    track.update(0.05, true)

    expect(track.update(1, false)).toMatchObject({ current: 'aa', progress: 0.5 })
  })

  it('ends a pause of the text when the voice comes back', () => {
    const track = new TextVisemeTrack([{ viseme: 'aa', units: 0.5 }, { viseme: 'sil', units: 3.5 }, { viseme: 'O', units: 1 }], 10)
    track.update(0.06, true)
    expect(track.update(0.05, false)?.current).toBe('sil')

    expect(track.update(0.01, true)?.current).toBe('O')
  })

  it('waits at a pause of the text until the audio pauses too', () => {
    const track = new TextVisemeTrack([{ viseme: 'aa', units: 0.5 }, { viseme: 'sil', units: 2 }, { viseme: 'O', units: 1 }], 10)
    track.update(0.06, true)

    // The audio still speaks: the text waits, and the caller follows the audio.
    expect(track.update(0.3, true)).toMatchObject({ current: 'sil', waiting: true })
    // The audio pauses, then speaks again: the next word starts in step.
    track.update(0.1, false)
    expect(track.update(0.01, true)).toMatchObject({ current: 'O', waiting: false })
  })

  it('stops waiting when the audio has no pause there', () => {
    const track = new TextVisemeTrack([{ viseme: 'aa', units: 0.5 }, { viseme: 'sil', units: 2 }, { viseme: 'O', units: 10 }], 10)
    track.update(0.06, true)
    track.update(0.3, true)

    expect(track.update(0.31, true)?.current).toBe('O')
  })

  it('jumps to its pause when the audio pauses first', () => {
    const steps = [{ viseme: 'aa', units: 1 }, { viseme: 'E', units: 1 }, { viseme: 'sil', units: 2 }, { viseme: 'O', units: 1 }] as const
    const track = new TextVisemeTrack(steps, 10)
    track.update(0.02, true)

    expect(track.update(0.16, false)?.current).toBe('sil')
  })
  it('slows down when it waits for the audio, and speeds up when it is late', () => {
    const steps = [{ viseme: 'aa', units: 0.5 }, { viseme: 'sil', units: 2 }, { viseme: 'O', units: 1 }, { viseme: 'E', units: 1 }, { viseme: 'sil', units: 2 }, { viseme: 'I', units: 1 }] as const
    const slow = new TextVisemeTrack(steps, 10)
    slow.update(0.06, true)
    slow.update(0.3, true)
    slow.update(0.05, false)
    expect(slow.rate).toBeLessThan(10)

    const fast = new TextVisemeTrack(steps.slice(2), 10)
    fast.update(0.02, true)
    fast.update(0.16, false)
    expect(fast.rate).toBeGreaterThan(10)
  })
})
