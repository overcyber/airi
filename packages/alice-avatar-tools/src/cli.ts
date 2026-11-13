import process from 'node:process'

import { readFile, writeFile } from 'node:fs/promises'

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
 */
async function main() {
  const args = process.argv.slice(2)
  if (args[0] === 'retune') {
    const [, input, output = input] = args
    if (!input) {
      console.error('Usage: pnpm -F @proj-airi/alice-avatar-tools convert retune <input.vrm> [output.vrm]')
      process.exitCode = 2
      return
    }
    const glb = readGlb(await readFile(input))
    const report = retuneVrm(glb)
    await writeFile(output, writeGlb(glb))
    console.info(JSON.stringify({ output, ...report }, null, 2))
    return
  }
  const [input, output, name = 'Eva', author = 'Alice'] = args
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
