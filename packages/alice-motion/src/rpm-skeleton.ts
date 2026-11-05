/**
 * The Ready Player Me skeleton, shared by the avatar converter (V4) and the FBX retarget (V5).
 *
 * Ready Player Me avatars use Mixamo style bone names without the `mixamorig` prefix, and they all share
 * the same bone axes. The TalkingHead FBX animations of the mirror are local rotations on this skeleton.
 */

/** VRM humanoid bone name to Ready Player Me (Mixamo style) node name. */
export const rpmHumanBones: Record<string, string> = {
  hips: 'Hips',
  spine: 'Spine',
  chest: 'Spine1',
  upperChest: 'Spine2',
  neck: 'Neck',
  head: 'Head',
  leftEye: 'LeftEye',
  rightEye: 'RightEye',
  leftUpperLeg: 'LeftUpLeg',
  leftLowerLeg: 'LeftLeg',
  leftFoot: 'LeftFoot',
  leftToes: 'LeftToeBase',
  rightUpperLeg: 'RightUpLeg',
  rightLowerLeg: 'RightLeg',
  rightFoot: 'RightFoot',
  rightToes: 'RightToeBase',
  leftShoulder: 'LeftShoulder',
  leftUpperArm: 'LeftArm',
  leftLowerArm: 'LeftForeArm',
  leftHand: 'LeftHand',
  rightShoulder: 'RightShoulder',
  rightUpperArm: 'RightArm',
  rightLowerArm: 'RightForeArm',
  rightHand: 'RightHand',
  ...fingerBones('left', 'Left'),
  ...fingerBones('right', 'Right'),
}

function fingerBones(vrmSide: string, rpmSide: string) {
  const bones: Record<string, string> = {
    [`${vrmSide}ThumbMetacarpal`]: `${rpmSide}HandThumb1`,
    [`${vrmSide}ThumbProximal`]: `${rpmSide}HandThumb2`,
    [`${vrmSide}ThumbDistal`]: `${rpmSide}HandThumb3`,
  }
  for (const [vrmFinger, rpmFinger] of [['Index', 'Index'], ['Middle', 'Middle'], ['Ring', 'Ring'], ['Little', 'Pinky']]) {
    bones[`${vrmSide}${vrmFinger}Proximal`] = `${rpmSide}Hand${rpmFinger}1`
    bones[`${vrmSide}${vrmFinger}Intermediate`] = `${rpmSide}Hand${rpmFinger}2`
    bones[`${vrmSide}${vrmFinger}Distal`] = `${rpmSide}Hand${rpmFinger}3`
  }
  return bones
}

const rpmToVrm = new Map(Object.entries(rpmHumanBones).map(([vrm, rpm]) => [rpm, vrm]))

/** Ready Player Me node name to VRM humanoid bone name. `mixamorig` prefixed names map too. */
export function vrmBoneOfRpmName(name: string): string | undefined {
  return rpmToVrm.get(name.replace(/^mixamorig\d*:?/, ''))
}

/**
 * Rest rotations of the Ready Player Me skeleton (A pose arms), parents before children.
 * Taken from a full body Ready Player Me avatar. Bone rotations are the same on every Ready Player Me avatar.
 */
export const rpmRestSkeleton: ReadonlyArray<{ name: string, parent: string | undefined, rotation: [number, number, number, number] }> = [
  { name: 'Hips', parent: undefined, rotation: [-0.02998, -0.00003, 0, 0.99955] },
  { name: 'LeftUpLeg', parent: 'Hips', rotation: [0.00191, 0.05637, -0.99785, 0.03353] },
  { name: 'RightUpLeg', parent: 'Hips', rotation: [0.00196, -0.05636, 0.99785, 0.03353] },
  { name: 'Spine', parent: 'Hips', rotation: [-0.01379, 0.00003, 0, 0.9999] },
  { name: 'LeftLeg', parent: 'LeftUpLeg', rotation: [-0.03768, 0.00034, -0.00098, 0.99929] },
  { name: 'RightLeg', parent: 'RightUpLeg', rotation: [-0.03768, -0.00034, 0.00098, 0.99929] },
  { name: 'Spine1', parent: 'Spine', rotation: [-0.03636, 0, 0, 0.99934] },
  { name: 'LeftFoot', parent: 'LeftLeg', rotation: [0.49508, -0.01496, -0.0299, 0.86821] },
  { name: 'RightFoot', parent: 'RightLeg', rotation: [0.49508, 0.01496, 0.02991, 0.8682] },
  { name: 'Spine2', parent: 'Spine1', rotation: [0.06359, 0, 0, 0.99798] },
  { name: 'LeftShoulder', parent: 'Spine2', rotation: [0.48169, 0.49277, -0.58891, 0.42231] },
  { name: 'LeftToeBase', parent: 'LeftFoot', rotation: [0.33071, -0.0103, 0.02613, 0.94331] },
  { name: 'Neck', parent: 'Spine2', rotation: [0.13965, 0, 0, 0.9902] },
  { name: 'RightShoulder', parent: 'Spine2', rotation: [0.48169, -0.49277, 0.58891, 0.42231] },
  { name: 'RightToeBase', parent: 'RightFoot', rotation: [0.33072, 0.0104, -0.02612, 0.94331] },
  { name: 'Head', parent: 'Neck', rotation: [-0.05336, 0, 0, 0.99858] },
  { name: 'LeftArm', parent: 'LeftShoulder', rotation: [0.3848, 0.06914, 0.03829, 0.91961] },
  { name: 'RightArm', parent: 'RightShoulder', rotation: [0.3848, -0.06914, -0.03829, 0.91961] },
  { name: 'LeftEye', parent: 'Head', rotation: [-0.07016, 0, 0, 0.99754] },
  { name: 'LeftForeArm', parent: 'LeftArm', rotation: [0.01539, -0.00923, 0.23766, 0.97118] },
  { name: 'RightEye', parent: 'Head', rotation: [-0.07016, 0, 0, 0.99754] },
  { name: 'RightForeArm', parent: 'RightArm', rotation: [0.01539, 0.00923, -0.23766, 0.97118] },
  { name: 'LeftHand', parent: 'LeftForeArm', rotation: [0.01598, -0.12042, -0.04006, 0.99179] },
  { name: 'RightHand', parent: 'RightForeArm', rotation: [0.01598, 0.12042, 0.04006, 0.99179] },
  { name: 'LeftHandIndex1', parent: 'LeftHand', rotation: [0.10183, -0.01313, 0.07581, 0.99182] },
  { name: 'LeftHandMiddle1', parent: 'LeftHand', rotation: [0.1042, -0.00027, -0.02734, 0.99418] },
  { name: 'LeftHandPinky1', parent: 'LeftHand', rotation: [0.1968, 0.02433, -0.19264, 0.96102] },
  { name: 'LeftHandRing1', parent: 'LeftHand', rotation: [0.13793, 0.02342, -0.0838, 0.98661] },
  { name: 'LeftHandThumb1', parent: 'LeftHand', rotation: [0.17929, 0.00309, 0.36818, 0.9123] },
  { name: 'RightHandIndex1', parent: 'RightHand', rotation: [0.10183, 0.01313, -0.07581, 0.99182] },
  { name: 'RightHandMiddle1', parent: 'RightHand', rotation: [0.1042, 0.00027, 0.02734, 0.99418] },
  { name: 'RightHandPinky1', parent: 'RightHand', rotation: [0.1968, -0.02433, 0.19264, 0.96102] },
  { name: 'RightHandRing1', parent: 'RightHand', rotation: [0.13793, -0.02343, 0.0838, 0.98661] },
  { name: 'RightHandThumb1', parent: 'RightHand', rotation: [0.17928, -0.00309, -0.36818, 0.9123] },
  { name: 'LeftHandIndex2', parent: 'LeftHandIndex1', rotation: [0.176, 0.03318, -0.02511, 0.98351] },
  { name: 'LeftHandMiddle2', parent: 'LeftHandMiddle1', rotation: [0.15075, 0.02292, 0.03965, 0.98751] },
  { name: 'LeftHandPinky2', parent: 'LeftHandPinky1', rotation: [0.08557, 0.0339, 0.07127, 0.9932] },
  { name: 'LeftHandRing2', parent: 'LeftHandRing1', rotation: [0.1734, 0.01942, 0.0339, 0.98408] },
  { name: 'LeftHandThumb2', parent: 'LeftHandThumb1', rotation: [0.03536, -0.0183, -0.22104, 0.97445] },
  { name: 'RightHandIndex2', parent: 'RightHandIndex1', rotation: [0.17599, -0.03319, 0.02511, 0.98351] },
  { name: 'RightHandMiddle2', parent: 'RightHandMiddle1', rotation: [0.15075, -0.02292, -0.03965, 0.98751] },
  { name: 'RightHandPinky2', parent: 'RightHandPinky1', rotation: [0.08557, -0.03391, -0.07126, 0.9932] },
  { name: 'RightHandRing2', parent: 'RightHandRing1', rotation: [0.1734, -0.01941, -0.0339, 0.98408] },
  { name: 'RightHandThumb2', parent: 'RightHandThumb1', rotation: [0.03536, 0.01829, 0.22104, 0.97445] },
  { name: 'LeftHandIndex3', parent: 'LeftHandIndex2', rotation: [0.13336, -0.04654, -0.03151, 0.98947] },
  { name: 'LeftHandMiddle3', parent: 'LeftHandMiddle2', rotation: [0.14576, -0.00718, 0.01019, 0.98924] },
  { name: 'LeftHandPinky3', parent: 'LeftHandPinky2', rotation: [0.10002, -0.03465, -0.01232, 0.99431] },
  { name: 'LeftHandRing3', parent: 'LeftHandRing2', rotation: [0.03109, -0.01305, -0.01882, 0.99925] },
  { name: 'LeftHandThumb3', parent: 'LeftHandThumb2', rotation: [0.06517, 0.0026, -0.06589, 0.99569] },
  { name: 'RightHandIndex3', parent: 'RightHandIndex2', rotation: [0.13337, 0.04656, 0.03151, 0.98947] },
  { name: 'RightHandMiddle3', parent: 'RightHandMiddle2', rotation: [0.14576, 0.00718, -0.01019, 0.98924] },
  { name: 'RightHandPinky3', parent: 'RightHandPinky2', rotation: [0.10003, 0.03466, 0.01231, 0.9943] },
  { name: 'RightHandRing3', parent: 'RightHandRing2', rotation: [0.03109, 0.01304, 0.01881, 0.99925] },
  { name: 'RightHandThumb3', parent: 'RightHandThumb2', rotation: [0.06518, -0.0026, 0.06589, 0.99569] },
]
