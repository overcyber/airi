import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MotionLibrary } from './motion-library'

describe('motionLibrary', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'motions-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('saves a checked motion in a readable JSON file, replaces one of the same name, and deletes', async () => {
    const path = join(dir, 'movimentos.json')
    const library = new MotionLibrary(path)
    expect(await library.load()).toEqual({ loaded: 0, skipped: 0 })

    expect(await library.save({ name: 'aceno', bones: { rightUpperArm: { levantar: 999 } } })).toMatchObject({ ok: true, motion: { name: 'aceno' } })
    expect(await library.save({ name: 'aceno', kind: 'pose', bones: { head: { frente: 10 } } })).toMatchObject({ ok: true })
    expect(await library.save({ bones: { head: { frente: 10 } } })).toMatchObject({ ok: false, reason: expect.stringContaining('name') })

    const file = JSON.parse(await readFile(path, 'utf8'))
    expect(file.motions).toHaveLength(1)
    expect(file.motions[0]).toMatchObject({ name: 'aceno', kind: 'pose' })

    const again = new MotionLibrary(path)
    expect(await again.load()).toEqual({ loaded: 1, skipped: 0 })
    expect(await again.delete('aceno')).toBe(true)
    expect(await again.delete('aceno')).toBe(false)
    expect(again.list()).toEqual([])
  })

  it('skips a broken motion of a file that a person edited', async () => {
    const path = join(dir, 'movimentos.json')
    await writeFile(path, JSON.stringify({ motions: [{ name: 'ok', bones: { head: { frente: 5 } } }, { name: 'Bad Name' }] }))
    const library = new MotionLibrary(path)
    expect(await library.load()).toEqual({ loaded: 1, skipped: 1 })
  })
})
