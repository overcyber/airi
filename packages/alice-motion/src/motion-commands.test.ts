import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { MotionCatalog } from './catalog'
import { NeoAliceTranslator } from './neoalice-bridge'

/**
 * The list of commands that the owner tests by hand with `mosquitto_pub`
 * (`docs/alice-motion-engine/movimentos/comandos.json`). Each one must reach the stage, not be ignored.
 */
interface ListedCommand { group: string, name: string, topic: string, payload: unknown }
const file = fileURLToPath(new URL('../../../docs/alice-motion-engine/movimentos/comandos.json', import.meta.url))
const list = JSON.parse(readFileSync(file, 'utf8')) as { site: string, comandos: ListedCommand[] }

describe('the list of commands to test by hand', () => {
  const translator = new NeoAliceTranslator({ site: list.site, catalog: new MotionCatalog() })

  it.each(list.comandos.map(command => [command.group, command.name, command] as const))('%s: %s reaches the stage', (_group, _name, command) => {
    const event = translator.translate(command.topic, JSON.stringify(command.payload), 0)

    expect(event.type, JSON.stringify(event)).not.toBe('ignored')
  })

  it('has no clamped or dropped value in the created examples', () => {
    const created = list.comandos.filter(command => command.group.startsWith('Movimentos criados'))
    expect(created.length).toBeGreaterThan(0)
    for (const command of created) {
      const event = translator.translate(command.topic, JSON.stringify(command.payload), 0)
      expect(event, command.name).toMatchObject({ type: 'custom-motion', warnings: [] })
    }
  })
})
