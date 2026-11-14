"""
Makes `lie-down.fbx`, the lying pose of the NeoAlice avatar, on the Ready Player Me skeleton.

The animation goes from standing to lying on the right side in 2.5 s, head on the right arm, then breathes in
the pose for 6 s. The stage plays the first 2.5 s once, loops the rest, and plays the entry backwards to get up
(`holdPoseClip` of `avatar-animator.ts`).

The poses are world rotations on the rest skeleton of `packages/alice-motion/src/rpm-skeleton.ts`, the same rest
that the FBX retarget (`fbx-retarget.ts`) reads. So the file plays on any VRM through the same retarget as the
other NeoAlice motions.

How to run, with the Blender Python module (bpy 4.2, Python 3.11):

    python lie-down.py <skeleton.fbx> <output.fbx> [--check-rest]

`<skeleton.fbx>` is any NeoAlice FBX of the same skeleton, for example `breathing-idle.fbx`. The script takes its
bones and bone lengths, drops its animation, and writes the new one. With `--check-rest`, it writes the rest
pose of the table instead, so a reader can check that the file gives the table back.
"""

import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
ENTRY_SECONDS = 2.5
LOOP_SECONDS = 6.0
BREATH_SECONDS = 3.0

HERE = Path(__file__).resolve().parent
SKELETON_TABLE = HERE.parents[1] / 'alice-motion' / 'src' / 'rpm-skeleton.ts'


def read_rest_table():
    """The rest rotations of the Ready Player Me skeleton, parents first: name, parent, quaternion (x, y, z, w)."""
    text = SKELETON_TABLE.read_text(encoding='utf-8')
    rows = re.findall(r"\{ name: '(\w+)', parent: (undefined|'\w+'), rotation: \[([^\]]+)\] \}", text)
    table = []
    for name, parent, rotation in rows:
        x, y, z, w = (float(value) for value in rotation.split(','))
        table.append((name, None if parent == 'undefined' else parent.strip("'"), Quaternion((w, x, y, z)).normalized()))
    if len(table) != 54:
        raise SystemExit(f'expected 54 bones in {SKELETON_TABLE}, found {len(table)}')
    return table


def world_rest(table):
    """World rotation of each rest bone, chained from the table."""
    world = {}
    for name, parent, local in table:
        world[name] = (world[parent] @ local) if parent else local.copy()
    return world


def rot(axis, degrees):
    """A world rotation about the X, Y, or Z axis."""
    return Quaternion(Vector({'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}[axis]), math.radians(degrees))


def aim(from_direction, to_direction):
    """The smallest rotation that turns one world direction into another."""
    return Vector(from_direction).normalized().rotation_difference(Vector(to_direction).normalized())


def smoothstep(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


# A key pose: the hips position in centimeters (Y up, Z toward the viewer, X to her left), and for each bone either
# `('aim', direction)`, the world direction of the bone, or `('turn', [(axis, degrees), ...])`, world rotations
# applied in order on top of the rest. A bone that is not listed follows its parent.
STANDING = {
    'hips': (0.0, 103.7, 0.0),
}

CROUCH = {
    'hips': (0.0, 58.0, 8.0),
    'Hips': ('turn', [('x', 14)]),
    'Spine': ('turn', [('x', 10)]),
    'Spine1': ('turn', [('x', 6)]),
    'Neck': ('turn', [('x', -14)]),
    'Head': ('turn', [('x', -10)]),
    'LeftUpLeg': ('aim', (0.18, -0.45, 0.88)),
    'LeftLeg': ('aim', (0.05, -0.92, -0.38)),
    'RightUpLeg': ('aim', (-0.18, -0.45, 0.88)),
    'RightLeg': ('aim', (-0.05, -0.92, -0.38)),
    'LeftArm': ('aim', (0.45, -0.75, 0.5)),
    'LeftForeArm': ('aim', (0.25, -0.75, 0.6)),
    'RightArm': ('aim', (-0.45, -0.75, 0.5)),
    'RightForeArm': ('aim', (-0.25, -0.75, 0.6)),
}

# Sitting on the floor on the right hip, the legs folded to her left, the right hand on the floor.
SIT_SIDE = {
    'hips': (6.0, 12.0, 2.0),
    'Hips': ('turn', [('z', 28), ('x', 6)]),
    'Spine': ('turn', [('z', -5)]),
    'Spine1': ('turn', [('z', -5)]),
    'Neck': ('turn', [('z', -8)]),
    'Head': ('turn', [('z', -6)]),
    'LeftUpLeg': ('aim', (0.72, -0.12, 0.68)),
    'LeftLeg': ('aim', (0.85, -0.05, -0.52)),
    'RightUpLeg': ('aim', (0.75, -0.2, 0.63)),
    'RightLeg': ('aim', (0.86, -0.08, -0.5)),
    'LeftArm': ('aim', (0.35, -0.8, 0.48)),
    'LeftForeArm': ('aim', (0.55, -0.55, 0.62)),
    'RightArm': ('aim', (-0.8, -0.55, 0.22)),
    'RightForeArm': ('aim', (-0.75, -0.62, 0.22)),
}

# Lying on the right side along the X axis: the head to her right (-X), the feet to her left (+X),
# the front toward the viewer, the head on the right forearm, the left hand on the hip, the knees bent.
LYING = {
    'hips': (10.0, 14.5, 0.0),
    'Hips': ('turn', [('z', 90), ('x', -10)]),
    'Spine': ('turn', [('z', -4)]),
    'Spine1': ('turn', [('z', -4)]),
    'Spine2': ('turn', [('z', -5)]),
    'Neck': ('turn', [('z', -12), ('x', -6)]),
    'Head': ('turn', [('z', -10), ('x', -8)]),
    'RightArm': ('aim', (-0.95, -0.05, 0.3)),
    'RightForeArm': ('aim', (0.55, 0.55, 0.62)),
    'RightHand': ('aim', (0.6, 0.4, 0.7)),
    'LeftArm': ('aim', (0.8, -0.2, 0.56)),
    'LeftForeArm': ('aim', (0.9, -0.25, 0.36)),
    'LeftHand': ('aim', (0.95, -0.1, 0.3)),
    'RightUpLeg': ('aim', (0.86, -0.04, 0.5)),
    'RightLeg': ('aim', (0.9, -0.02, -0.44)),
    'RightFoot': ('aim', (0.6, -0.1, -0.8)),
    'LeftUpLeg': ('aim', (0.84, 0.1, 0.53)),
    'LeftLeg': ('aim', (0.88, 0.08, -0.47)),
    'LeftFoot': ('aim', (0.6, 0.0, -0.8)),
}

KEYS = [
    (0.0, STANDING),
    (0.9, CROUCH),
    (1.7, SIT_SIDE),
    (ENTRY_SECONDS, LYING),
]


def pose_deltas(table, rest, key):
    """The accumulated world rotation of each bone of a key pose, parents first."""
    deltas = {}
    for name, parent, _local in table:
        inherited = deltas[parent] if parent else Quaternion()
        spec = key.get(name)
        if spec is None:
            deltas[name] = inherited.copy()
            continue
        kind, value = spec
        if kind == 'aim':
            current = (inherited @ rest[name]) @ Vector((0.0, 1.0, 0.0))
            deltas[name] = aim(current, value) @ inherited
        else:
            extra = Quaternion()
            for axis, degrees in value:
                extra = rot(axis, degrees) @ extra
            deltas[name] = extra @ inherited
    return deltas


def own_rotation(deltas, table):
    """The rotation of each bone on top of its parent (the part that a key pose adds), for interpolation."""
    own = {}
    for name, parent, _local in table:
        inherited = deltas[parent] if parent else Quaternion()
        own[name] = deltas[name] @ inherited.inverted()
    return own


def frame_pose(table, rest, keys, seconds):
    """World rotation per bone and the hips position at a time of the entry, eased between the key poses."""
    times = [time for time, _ in keys]
    if seconds >= times[-1]:
        index = len(keys) - 2
        t = 1.0
    else:
        index = max(i for i, time in enumerate(times) if time <= seconds)
        t = smoothstep((seconds - times[index]) / (times[index + 1] - times[index]))
    before, after = keys[index][1], keys[index + 1][1]
    own_before = own_rotation(pose_deltas(table, rest, before), table)
    own_after = own_rotation(pose_deltas(table, rest, after), table)
    deltas = {}
    for name, parent, _local in table:
        inherited = deltas[parent] if parent else Quaternion()
        deltas[name] = own_before[name].slerp(own_after[name], t) @ inherited
    hips = Vector(before['hips']).lerp(Vector(after['hips']), t)
    return deltas, hips


def breathing(table, rest, seconds):
    """The lying pose with a breath of the chest and a slow settle of the head and the top leg. A cycle of 6 s."""
    deltas, hips = frame_pose(table, rest, KEYS, ENTRY_SECONDS)
    phase = 2 * math.pi * seconds / BREATH_SECONDS
    slow = 2 * math.pi * seconds / LOOP_SECONDS
    extra = {
        'Spine1': rot('x', -0.8 * math.sin(phase)) @ rot('z', 0.5 * math.sin(phase)),
        'Spine2': rot('x', -1.2 * math.sin(phase)) @ rot('z', 0.7 * math.sin(phase)),
        'Head': rot('z', 1.2 * math.sin(slow)) @ rot('x', -0.8 * math.sin(slow)),
        'LeftUpLeg': rot('z', 0.8 * math.sin(slow + 1.0)),
        'LeftArm': rot('z', 0.6 * math.sin(slow + 0.5)),
    }
    own = own_rotation(deltas, table)
    result = {}
    for name, parent, _local in table:
        inherited = result[parent] if parent else Quaternion()
        result[name] = (extra.get(name, Quaternion()) @ own[name]) @ inherited
    return result, hips + Vector((0.0, 0.25 * math.sin(phase), 0.0))


def local_rotations(table, rest, deltas):
    """Local rotation of each bone in the convention of the FBX file: relative to the posed parent."""
    locals_ = {}
    posed = {name: deltas[name] @ rest[name] for name, _, _ in table}
    for name, parent, _local in table:
        locals_[name] = (posed[parent].inverted() @ posed[name]) if parent else posed[name]
    return locals_


def animation_frames(table, rest, check_rest):
    frames = []
    if check_rest:
        locals_ = local_rotations(table, rest, {name: Quaternion() for name, _, _ in table})
        return [(locals_, Vector(STANDING['hips']))] * 2
    total = int(round((ENTRY_SECONDS + LOOP_SECONDS) * FPS)) + 1
    for frame in range(total):
        seconds = frame / FPS
        if seconds <= ENTRY_SECONDS:
            deltas, hips = frame_pose(table, rest, KEYS, seconds)
        else:
            deltas, hips = breathing(table, rest, seconds - ENTRY_SECONDS)
        frames.append((local_rotations(table, rest, deltas), hips))
    return frames


def import_skeleton(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True, automatic_bone_orientation=False, primary_bone_axis='Y', secondary_bone_axis='X')
    armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    if len(armatures) != 1:
        raise SystemExit(f'expected one armature in {path}, found {len(armatures)}')
    return armatures[0]


def blender_rest(armature):
    """Rest rotation and translation of each bone relative to its parent, as Blender keeps them."""
    rest = {}
    for bone in armature.data.bones:
        local = (bone.parent.matrix_local.inverted() @ bone.matrix_local) if bone.parent else bone.matrix_local.copy()
        rest[bone.name] = (local.to_quaternion().normalized(), local.to_translation())
    return rest


def write_animation(armature, frames):
    armature.animation_data_clear()
    action = bpy.data.actions.new('LieDown')
    armature.animation_data_create()
    armature.animation_data.action = action
    rest = blender_rest(armature)
    hips_rest_rotation, hips_rest_translation = rest['Hips']
    # The import keeps the centimeters of the file as Blender units. The hips of the skeleton stand about 103 cm high.
    scale = 1.0
    if not 90 < hips_rest_translation.y < 120:
        raise SystemExit(f'unexpected hips height {hips_rest_translation.y:.3f} in the skeleton file: not a Ready Player Me FBX in centimeters')
    bpy.ops.object.mode_set(mode='POSE')
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = 'QUATERNION'
    for frame, (locals_, hips) in enumerate(frames):
        for pose_bone in armature.pose.bones:
            name = pose_bone.name
            if name not in locals_:
                continue
            rest_rotation = rest[name][0]
            # The pose of a Blender bone is relative to its rest: rest * basis = the local rotation of the file.
            pose_bone.rotation_quaternion = rest_rotation.inverted() @ locals_[name]
            pose_bone.keyframe_insert('rotation_quaternion', frame=frame)
            if name == 'Hips':
                target = Vector(hips) * scale
                pose_bone.location = hips_rest_rotation.inverted() @ (target - hips_rest_translation)
                pose_bone.keyframe_insert('location', frame=frame)
    bpy.ops.object.mode_set(mode='OBJECT')
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = len(frames) - 1
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = 'LINEAR'


def export(armature, path):
    bpy.ops.object.select_all(action='DESELECT')
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.fbx(
        filepath=str(path),
        use_selection=True,
        object_types={'ARMATURE'},
        add_leaf_bones=False,
        armature_nodetype='NULL',
        primary_bone_axis='Y',
        secondary_bone_axis='X',
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False,
        bake_anim_force_startend_keying=True,
        bake_anim_step=1.0,
        bake_anim_simplify_factor=0.0,
        axis_forward='-Z',
        axis_up='Y',
    )


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    skeleton, output = Path(argv[0]), Path(argv[1])
    check_rest = '--check-rest' in argv[2:]
    table = read_rest_table()
    rest = world_rest(table)
    armature = import_skeleton(skeleton)
    frames = animation_frames(table, rest, check_rest)
    write_animation(armature, frames)
    export(armature, output)
    print(f'wrote {output} with {len(frames)} frames at {FPS} fps')


if __name__ == '__main__':
    main(sys.argv[1:])
