import type { CustomMotion } from '@proj-airi/alice-motion'

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { parseCustomMotion } from '@proj-airi/alice-motion'

/**
 * The saved poses and movements that NeoAlice or an LLM created, by name, in one JSON file.
 *
 * The file is `{"version": 1, "motions": [...]}`, easy to read and to edit by hand. A write goes to a temporary
 * file first and then replaces the old one, so a crash leaves the old or the new file. Each motion passes the
 * same check as on the stage (`parseCustomMotion`), also when the file was edited by hand.
 */
export class MotionLibrary {
  private readonly motions = new Map<string, CustomMotion>()

  constructor(private readonly path: string) {}

  /** Reads the file. A missing file is an empty library. A broken motion in the file is skipped. */
  async load(): Promise<{ loaded: number, skipped: number }> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { loaded: 0, skipped: 0 }
      throw error
    }
    const data = JSON.parse(text) as { motions?: unknown }
    const items = Array.isArray(data.motions) ? data.motions : []
    let skipped = 0
    this.motions.clear()
    for (const item of items) {
      const parsed = parseCustomMotion(item)
      if (parsed.ok && parsed.motion.name)
        this.motions.set(parsed.motion.name, parsed.motion)
      else
        skipped++
    }
    return { loaded: this.motions.size, skipped }
  }

  list(): CustomMotion[] {
    return [...this.motions.values()].sort((a, b) => a.name!.localeCompare(b.name!))
  }

  /** Checks and keeps a named motion, replacing one of the same name. Returns the reason when it cannot. */
  async save(input: unknown): Promise<{ ok: true, motion: CustomMotion } | { ok: false, reason: string }> {
    const parsed = parseCustomMotion(input)
    if (!parsed.ok)
      return parsed
    if (!parsed.motion.name)
      return { ok: false, reason: 'a saved motion needs a name' }
    this.motions.set(parsed.motion.name, parsed.motion)
    await this.write()
    return { ok: true, motion: parsed.motion }
  }

  /** Removes a motion by name. Returns `false` when the library has no such motion. */
  async delete(name: string): Promise<boolean> {
    if (!this.motions.delete(name))
      return false
    await this.write()
    return true
  }

  private async write() {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, `${JSON.stringify({ version: 1, motions: this.list() }, null, 2)}\n`, 'utf8')
    await rename(temporary, this.path)
  }
}
