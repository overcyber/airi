import { rpmHumanBones, rpmRestSkeleton } from './rpm-skeleton'

/**
 * The bones and the face shapes ("muscles") of the Eva avatar, for an LLM that creates poses and movements.
 *
 * Each bone has anatomical axes in degrees with human limits, so a model writes `{"leftUpperArm": {"levantar": 170}}`
 * and not a quaternion. The renderer (`custom-motion-clip.ts` of stage-ui-three) turns the axes into rotations.
 * `custom-motion.ts` checks a motion and clamps each value to its limits.
 */

/** How the renderer turns the axes of a bone into a rotation. */
export type RigJointKind = 'trunk' | 'shoulder' | 'upperArm' | 'lowerArm' | 'hand' | 'finger' | 'thumb' | 'upperLeg' | 'lowerLeg' | 'foot' | 'toes' | 'hips'

export interface RigAxis {
  min: number
  max: number
  /** What a positive value does, in Portuguese. */
  description: string
}

export interface RigBone {
  /** VRM humanoid bone name, the key of a motion. */
  bone: string
  /** Ready Player Me node name, the key of the TalkingHead format. */
  rpmName: string
  parent?: string
  side: 'left' | 'right' | 'center'
  kind: RigJointKind
  description: string
  /** Axes in degrees, `hips.subir` in centimeters. 0 is the standing rest pose, arms down. */
  axes: Record<string, RigAxis>
}

function trunkAxes(forward: number, side: number, turn: number): Record<string, RigAxis> {
  return {
    frente: { min: -forward / 2, max: forward, description: 'inclina para a frente (negativo: para trás)' },
    lado: { min: -side, max: side, description: 'inclina para a direita dela (negativo: para a esquerda)' },
    girar: { min: -turn, max: turn, description: 'gira para a esquerda dela (negativo: para a direita)' },
  }
}

const fingerNames: Record<string, string> = { Thumb: 'polegar', Index: 'indicador', Middle: 'médio', Ring: 'anelar', Little: 'mínimo' }
const segmentNames: Record<string, string> = { Metacarpal: 'base', Proximal: 'primeira falange', Intermediate: 'segunda falange', Distal: 'ponta' }

function describe(bone: string): Pick<RigBone, 'side' | 'kind' | 'description' | 'axes'> | undefined {
  const side = bone.startsWith('left') ? 'left' : bone.startsWith('right') ? 'right' : 'center'
  const sideName = side === 'left' ? 'esquerdo' : 'direito'
  const plain = bone.replace(/^(?:left|right)/, '')
  switch (plain) {
    case 'hips':
      return { side, kind: 'hips', description: 'quadril, a raiz do corpo', axes: { ...trunkAxes(90, 45, 90), subir: { min: -95, max: 20, description: 'sobe o corpo em centímetros (negativo: desce, -90 senta no chão)' } } }
    case 'spine':
      return { side, kind: 'trunk', description: 'coluna baixa', axes: trunkAxes(40, 25, 30) }
    case 'chest':
      return { side, kind: 'trunk', description: 'tórax', axes: trunkAxes(30, 20, 30) }
    case 'upperChest':
      return { side, kind: 'trunk', description: 'peito', axes: trunkAxes(20, 15, 20) }
    case 'neck':
      return { side, kind: 'trunk', description: 'pescoço', axes: trunkAxes(40, 30, 50) }
    case 'head':
      return { side, kind: 'trunk', description: 'cabeça', axes: trunkAxes(40, 35, 70) }
    case 'Shoulder':
      return { side, kind: 'shoulder', description: `ombro ${sideName} (clavícula)`, axes: { levantar: { min: -10, max: 30, description: 'sobe o ombro' }, frente: { min: -15, max: 25, description: 'leva o ombro para a frente' } } }
    case 'UpperArm':
      return { side, kind: 'upperArm', description: `braço ${sideName}`, axes: {
        levantar: { min: 0, max: 180, description: 'ângulo do braço a partir de baixo: 0 junto ao corpo, 90 na horizontal, 180 para cima' },
        frente: { min: -30, max: 135, description: 'direção do braço: 0 para o lado, 90 para a frente, 135 cruzando o peito' },
        torcer: { min: -90, max: 90, description: 'gira o braço no próprio eixo, palma para cima (negativo: para baixo)' },
      } }
    case 'LowerArm':
      return { side, kind: 'lowerArm', description: `antebraço ${sideName} (cotovelo)`, axes: { dobrar: { min: 0, max: 150, description: 'dobra o cotovelo' }, torcer: { min: -80, max: 80, description: 'gira o antebraço, palma para cima (negativo: para baixo)' } } }
    case 'Hand':
      return { side, kind: 'hand', description: `mão ${sideName} (pulso)`, axes: { dobrar: { min: -70, max: 80, description: 'dobra o pulso para a palma (negativo: para trás)' }, desviar: { min: -25, max: 35, description: 'leva a mão para o lado do mínimo' } } }
    case 'UpperLeg':
      return { side, kind: 'upperLeg', description: `coxa ${sideName} (quadril)`, axes: { frente: { min: -30, max: 120, description: 'levanta a perna para a frente' }, lado: { min: -20, max: 60, description: 'abre a perna para o lado' }, girar: { min: -40, max: 40, description: 'gira a perna para fora' } } }
    case 'LowerLeg':
      return { side, kind: 'lowerLeg', description: `canela ${sideName} (joelho)`, axes: { dobrar: { min: 0, max: 150, description: 'dobra o joelho' } } }
    case 'Foot':
      return { side, kind: 'foot', description: `pé ${sideName} (tornozelo)`, axes: { apontar: { min: -20, max: 45, description: 'aponta o pé para baixo (negativo: para cima)' }, girar: { min: -30, max: 30, description: 'gira o pé para fora' } } }
    case 'Toes':
      return { side, kind: 'toes', description: `dedos do pé ${sideName}`, axes: { dobrar: { min: -30, max: 40, description: 'dobra os dedos do pé para baixo' } } }
    default: {
      const finger = /^(Thumb|Index|Middle|Ring|Little)(Metacarpal|Proximal|Intermediate|Distal)$/.exec(plain)
      if (!finger)
        return undefined
      const name = `${fingerNames[finger[1]]} ${sideName}, ${segmentNames[finger[2]]}`
      if (finger[1] === 'Thumb') {
        return { side, kind: 'thumb', description: name, axes: {
          fechar: { min: -10, max: 60, description: 'fecha o polegar sobre a palma' },
          ...(finger[2] === 'Metacarpal' && { abrir: { min: -10, max: 50, description: 'afasta o polegar da mão' } }),
        } }
      }
      const curl = finger[2] === 'Proximal' ? 90 : finger[2] === 'Intermediate' ? 100 : 80
      return { side, kind: 'finger', description: name, axes: {
        fechar: { min: -10, max: curl, description: 'fecha o dedo (90 é um punho)' },
        ...(finger[2] === 'Proximal' && { abrir: { min: -20, max: 20, description: 'afasta o dedo dos vizinhos' } }),
      } }
    }
  }
}

const vrmOfRpm = new Map(Object.entries(rpmHumanBones).map(([vrm, rpm]) => [rpm, vrm]))

/** Every bone of the rig that a motion can move, parents first. The eyes stay with the look-at. */
export const avatarRigBones: readonly RigBone[] = rpmRestSkeleton.flatMap((rest) => {
  const bone = vrmOfRpm.get(rest.name)
  const info = bone && !bone.endsWith('Eye') ? describe(bone) : undefined
  if (!bone || !info)
    return []
  const parent = rest.parent ? vrmOfRpm.get(rest.parent) : undefined
  return [{ bone, rpmName: rest.name, ...(parent && { parent }), ...info }]
})

const rigByBone = new Map(avatarRigBones.map(bone => [bone.bone, bone]))

/** The bone of the rig, or `undefined` for a name that the rig does not have. */
export function rigBone(bone: string): RigBone | undefined {
  return rigByBone.get(bone)
}

/**
 * The 52 ARKit face shapes of Eva (the "muscles" of the face), with what each one does. Weights go from 0 to 1.
 * The look-at moves the eyes, so the `eyeLook*` shapes are left out.
 */
export const avatarFaceShapes: Readonly<Record<string, string>> = {
  browDownLeft: 'abaixa a sobrancelha esquerda',
  browDownRight: 'abaixa a sobrancelha direita',
  browInnerUp: 'levanta o meio das sobrancelhas (preocupação, tristeza)',
  browOuterUpLeft: 'levanta a ponta da sobrancelha esquerda',
  browOuterUpRight: 'levanta a ponta da sobrancelha direita',
  cheekPuff: 'enche as bochechas de ar',
  cheekSquintLeft: 'sobe a bochecha esquerda (sorriso verdadeiro)',
  cheekSquintRight: 'sobe a bochecha direita',
  eyeBlinkLeft: 'fecha o olho esquerdo',
  eyeBlinkRight: 'fecha o olho direito',
  eyeSquintLeft: 'aperta o olho esquerdo',
  eyeSquintRight: 'aperta o olho direito',
  eyeWideLeft: 'arregala o olho esquerdo',
  eyeWideRight: 'arregala o olho direito',
  jawForward: 'leva o queixo para a frente',
  jawLeft: 'leva o queixo para a esquerda',
  jawOpen: 'abre a boca pela mandíbula',
  jawRight: 'leva o queixo para a direita',
  mouthClose: 'fecha os lábios com a boca aberta',
  mouthDimpleLeft: 'covinha à esquerda',
  mouthDimpleRight: 'covinha à direita',
  mouthFrownLeft: 'canto esquerdo da boca para baixo',
  mouthFrownRight: 'canto direito da boca para baixo',
  mouthFunnel: 'boca em funil (som de "ó")',
  mouthLeft: 'boca para a esquerda',
  mouthLowerDownLeft: 'abaixa o lábio de baixo à esquerda',
  mouthLowerDownRight: 'abaixa o lábio de baixo à direita',
  mouthPressLeft: 'aperta os lábios à esquerda',
  mouthPressRight: 'aperta os lábios à direita',
  mouthPucker: 'bico (beijo)',
  mouthRight: 'boca para a direita',
  mouthRollLower: 'enrola o lábio de baixo para dentro',
  mouthRollUpper: 'enrola o lábio de cima para dentro',
  mouthShrugLower: 'sobe o lábio de baixo',
  mouthShrugUpper: 'sobe o lábio de cima',
  mouthSmileLeft: 'sorriso, canto esquerdo',
  mouthSmileRight: 'sorriso, canto direito',
  mouthStretchLeft: 'estica a boca para a esquerda',
  mouthStretchRight: 'estica a boca para a direita',
  mouthUpperUpLeft: 'sobe o lábio de cima à esquerda',
  mouthUpperUpRight: 'sobe o lábio de cima à direita',
  noseSneerLeft: 'franze o nariz à esquerda',
  noseSneerRight: 'franze o nariz à direita',
  tongueOut: 'mostra a língua',
}

/** The whole rig as plain data, for the prompt of an LLM and for `evt/avatar/rig`. */
export function avatarRigData() {
  return {
    version: 1,
    units: { 'angles': 'graus', 'hips.subir': 'centímetros', 'face': '0 a 1' },
    restPose: 'Em pé, braços para baixo junto ao corpo. Todo eixo em 0 é essa pose.',
    bones: avatarRigBones.map(({ bone, rpmName, parent, description, axes }) => ({ bone, rpmName, ...(parent && { parent }), description, axes })),
    face: avatarFaceShapes,
  }
}
