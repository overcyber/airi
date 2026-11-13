import process from 'node:process'

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { errorMessageFrom } from '@moeru/std'

import { addFloorCollider } from './floor-collider'
import { readGlb, writeGlb } from './glb'
import { addHairSprings } from './hair-springs'
import { retuneVrm } from './retune'
import { convertRpmToVrm } from './rpm-to-vrm'

/**
 * Usage: pnpm -F @proj-airi/alice-avatar-tools convert <input.glb> <output.vrm> [name] [author]
 *        pnpm -F @proj-airi/alice-avatar-tools convert retune <input.vrm> [output.vrm]
 *
 * Works offline. The input and the output stay on this machine.
 * Relative paths start at the folder where you typed the command, not at this package.
 */
async function main() {
  // `pnpm -F` runs the script in the package folder. pnpm keeps the folder of the command in INIT_CWD.
  const base = process.env.INIT_CWD ?? process.cwd()
  const args = process.argv.slice(2).filter(arg => arg !== '--')
  const path = (arg: string | undefined) => arg === undefined ? undefined : resolve(base, arg)
  if (args[0] === 'retune') {
    const input = path(args[1])
    if (!input) {
      console.error('Usage: pnpm -F @proj-airi/alice-avatar-tools convert retune <input.vrm> [output.vrm]')
      process.exitCode = 2
      return
    }
    const output = path(args[2]) ?? input
    const glb = readGlb(await readFile(input))
    const report = retuneVrm(glb)
    await writeFile(output, writeGlb(glb))
    console.info(JSON.stringify({ output, ...report }, null, 2))
    return
  }
  const input = path(args[0])
  const output = path(args[1])
  const [, , name = 'Eva', author = 'Alice'] = args
  if (!input || !output) {
    console.error('Usage: pnpm -F @proj-airi/alice-avatar-tools convert <input.glb> <output.vrm> [name] [author]')
    process.exitCode = 2
    return
  }
  const glb = readGlb(await readFile(input))
  const report = convertRpmToVrm(glb, { name, authors: [author], otherLicenseUrl: 'https://readyplayer.me/terms' })
  const hair = addHairSprings(glb)
  const floor = addFloorCollider(glb)
  await writeFile(output, writeGlb(glb))
  console.info(JSON.stringify({ output, ...report, hair, floor }, null, 2))
}

main().catch((error: unknown) => {
  console.error(errorMessageFrom(error) ?? 'The conversion failed')
  process.exitCode = 1
})
