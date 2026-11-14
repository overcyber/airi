import { describe, expect, it } from 'vitest'

import { mosquittoCommand, motionDirectory } from './motion-directory'

describe('motionDirectory', () => {
  it('lists the catalog poses and gestures, the animation files, and the created motions, with their commands', () => {
    const entries = motionDirectory(
      [
        { id: 'wave_hello', name: 'Wave Hello', description: 'Wave', url: 'https://example.com/a/wave.fbx', format: 'fbx' },
        { id: 'lie_down', name: 'Lie Down', description: 'Lie', url: 'https://example.com/a/lie.fbx', format: 'fbx', pose: { loopFromSeconds: 5 } },
      ],
      [{ name: 'vitoria', kind: 'gesture', format: 'bones', duration: 3, mirror: false, keyframes: [], props: {} }],
    )
    const names = entries.map(entry => `${entry.group}:${entry.name}`)
    expect(names).toEqual(expect.arrayContaining(['pose:lying', 'pose:sitting', 'gesto:namaste', 'gesto:yawn', 'animacao:Wave Hello', 'criado:vitoria']))
    expect(names).not.toContain('gesto:wave_mirror')
    expect(names).not.toContain('animacao:Lie Down')
    const created = entries.find(entry => entry.name === 'vitoria')!
    expect(mosquittoCommand(created, '192.0.2.10', 'magicmirror')).toBe(`mosquitto_pub -h 192.0.2.10 -t "neoalice/v1/magicmirror/cmd/avatar/gesture" -m '{"gesture":"vitoria","duration":3}'`)
  })
})
