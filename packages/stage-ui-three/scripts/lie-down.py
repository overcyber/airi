"""
Makes `lie-down.fbx` and `get-up.fbx`, the lying pose of the NeoAlice avatar, on the Ready Player Me skeleton.

`lie-down.fbx` goes from standing to lying on the right side in 6.6 s, then breathes in the pose for 9 s. She goes
to the floor the way a person does: she looks down, steps the right foot back and lowers with the right hand
reaching for the floor, kneels on the right knee, then on both, sits on her right hip with the legs folded to her
left, lowers onto the right forearm, and lets the head rest on the arm.

The key poses give the posture. A key can also pin a foot or a hand to a place on the floor (`ik`), and the script
solves the leg or the arm on every frame, so a planted foot does not slide. The hips rest on the floor by
themselves: the lowest supporting part touches it and nothing sinks. The hips never descend faster than a person
lowers (`MAX_DESCENT_CM_PER_SECOND`). The old clip had no such rule: the feet sank up to 70 cm under the floor,
and each key made the body jump, because the rotation curve had its four points in the wrong order.

`get-up.fbx` (with `--get-up`) goes the human way up, not the same path backwards: she pushes up on the right arm,
sits, comes to the knees with the hand on the floor, rises, and the head comes up last.

The stage plays the first 6.6 s of `lie-down.fbx` once, loops the rest, and plays `get-up.fbx` to get up
(`holdPoseClip` of `avatar-animator.ts`, `loopFromSeconds` of `animations/index.ts`).

The poses are world rotations on the rest skeleton of `packages/alice-motion/src/rpm-skeleton.ts`, the same rest
that the FBX retarget (`fbx-retarget.ts`) reads. So the file plays on any VRM through the same retarget as the
other NeoAlice motions.

How to run, with the Blender Python module (bpy 4.2, Python 3.11):

    python lie-down.py <skeleton.fbx> <output.fbx> [--check-rest | --get-up | --analyze | --smooth]

`<skeleton.fbx>` is any NeoAlice FBX of the same skeleton, for example `breathing-idle.fbx`. The script takes its
bones and bone lengths, drops its animation, and writes the new one. With `--check-rest`, it writes the rest
pose of the table instead, so a reader can check that the file gives the table back. With `--analyze`, it prints
the floor clearance and the speeds of each frame. With `--smooth`, it lists the fastest hips and joints and the
speed jumps. Both do not write a file. Add `--get-up` to check the get-up.
"""

import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
ENTRY_SECONDS = 6.6
GET_UP_SECONDS = 5.2
LOOP_SECONDS = 9.0
# A sleeping breath: about 13 per minute, the inhale shorter than the exhale.
BREATH_SECONDS = 4.5
INHALE_SHARE = 0.4

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


def slerp_direction(a, b, t):
    """A direction between two directions, turning at a steady rate, so a foot does not flip through the middle."""
    a, b = Vector(a).normalized(), Vector(b).normalized()
    return (Quaternion().slerp(a.rotation_difference(b), t) @ a).normalized()


def smoothstep(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def breath(seconds):
    """A breath from 0 (out) to 1 (in): a quick inhale, a slow exhale, and a short pause at the bottom."""
    phase = (seconds / BREATH_SECONDS) % 1.0
    if phase < INHALE_SHARE:
        return smoothstep(phase / INHALE_SHARE)
    return 1.0 - smoothstep((phase - INHALE_SHARE) / (1.0 - INHALE_SHARE) * 1.15)


# A key pose: the hips position in centimeters (Y up, Z toward the viewer, X to her left), and for each bone either
# `('aim', direction)`, the world direction of the bone, or `('turn', [(axis, degrees), ...])`, world rotations
# applied in order on top of the rest. A bone that is not listed follows its parent.
STANDING = {
    'hips': (0.0, 103.7, 0.0),
}

# The weight goes to the right foot, and she looks down and to the right, at the place where she will lie.
LOOK_DOWN = {
    'hips': (-2.0, 101.5, 1.5),
    'Hips': ('turn', [('z', -3)]),
    'Spine': ('turn', [('x', 3)]),
    'Neck': ('turn', [('x', 12), ('y', -10)]),
    'Head': ('turn', [('x', 10), ('y', -12)]),
    'RightArm': ('aim', (-0.3, -0.92, 0.25)),
    'RightForeArm': ('aim', (-0.25, -0.88, 0.4)),
    'LeftArm': ('aim', (0.2, -0.97, 0.1)),
    'LeftForeArm': ('aim', (0.15, -0.95, 0.25)),
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

# Low on the knees, the weight on the right hand on the floor beside her, the left hand on the left knee.
HAND_DOWN = {
    'hips': (-2.0, 38.0, 4.0),
    'Hips': ('turn', [('x', 30), ('z', 10)]),
    'Spine': ('turn', [('x', 12)]),
    'Spine1': ('turn', [('x', 4)]),
    'Neck': ('turn', [('x', 6), ('y', -6)]),
    'Head': ('turn', [('x', 4), ('y', -8)]),
    'RightUpLeg': ('aim', (-0.15, -0.2, 0.97)),
    'RightLeg': ('aim', (-0.05, -0.95, -0.3)),
    'LeftUpLeg': ('aim', (0.25, -0.25, 0.93)),
    'LeftLeg': ('aim', (0.1, -0.95, -0.3)),
    'RightArm': ('aim', (-0.5, -0.85, 0.15)),
    'RightForeArm': ('aim', (-0.35, -0.93, 0.05)),
    'RightHand': ('aim', (-0.3, -0.5, 0.8)),
    'LeftArm': ('aim', (0.3, -0.8, 0.52)),
    'LeftForeArm': ('aim', (0.15, -0.6, 0.78)),
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
    'LeftUpLeg': ('aim', (0.86, -0.12, 0.5)),
    'LeftLeg': ('aim', (0.9, -0.1, -0.43)),
    'LeftFoot': ('aim', (0.6, -0.2, -0.78)),
}

# Getting up: still lying, the right arm pushes the chest up from the floor.
PUSH_UP = {
    'hips': (8.0, 13.5, 1.0),
    'Hips': ('turn', [('z', 60), ('x', -4)]),
    'Spine': ('turn', [('z', -8)]),
    'Spine1': ('turn', [('z', -8)]),
    'Spine2': ('turn', [('z', -6)]),
    'Neck': ('turn', [('z', -10)]),
    'Head': ('turn', [('z', -12), ('x', 6)]),
    'RightArm': ('aim', (-0.55, -0.82, 0.15)),
    'RightForeArm': ('aim', (-0.45, -0.88, 0.15)),
    'RightHand': ('aim', (-0.4, -0.3, 0.86)),
    'LeftArm': ('aim', (0.5, -0.6, 0.62)),
    'LeftForeArm': ('aim', (0.6, -0.3, 0.74)),
    'RightUpLeg': ('aim', (0.86, -0.04, 0.5)),
    'RightLeg': ('aim', (0.9, -0.02, -0.44)),
    'LeftUpLeg': ('aim', (0.84, 0.1, 0.53)),
    'LeftLeg': ('aim', (0.88, 0.08, -0.47)),
}

# Rising: the legs push, the chest is still bent forward, and the head is still down.
RISE = {
    'hips': (-1.0, 74.0, 6.0),
    'Hips': ('turn', [('x', 20)]),
    'Spine': ('turn', [('x', 10)]),
    'Spine1': ('turn', [('x', 4)]),
    'Neck': ('turn', [('x', 10)]),
    'Head': ('turn', [('x', 8)]),
    'LeftUpLeg': ('aim', (0.12, -0.75, 0.62)),
    'LeftLeg': ('aim', (0.04, -0.98, -0.18)),
    'RightUpLeg': ('aim', (-0.12, -0.75, 0.62)),
    'RightLeg': ('aim', (-0.04, -0.98, -0.18)),
    'LeftArm': ('aim', (0.3, -0.9, 0.3)),
    'LeftForeArm': ('aim', (0.2, -0.85, 0.48)),
    'RightArm': ('aim', (-0.3, -0.9, 0.3)),
    'RightForeArm': ('aim', (-0.2, -0.85, 0.48)),
}

# ---- The lie down, in the way a person goes to the floor --------------------------------------------------------
# 1. A look at the floor, the weight on the feet. 2. The right foot steps back and the body lowers, the right hand
# reaches for the floor. 3. The right knee and the right hand take the weight (a half kneel). 4. The left knee comes
# down. 5. She shifts onto the right hip, the legs fold to her left, the right hand holds her. 6. She lowers onto the
# right forearm and the legs stretch. 7. The head settles on the arm: the pose of `LYING`.
# `ik` pins a foot or a hand to a place on the floor, in centimeters. The hips rest on the floor by themselves.
FOOT_FLAT = (0.0, -0.61, 0.79)
FOOT_BACK = (0.0, -0.3, -0.95)
HAND_FLOOR = (0.0, -0.25, 0.97)
KNEE_FORWARD = (0.0, 0.0, 1.0)
ELBOW_OUT = (-0.7, 0.2, -0.7)

LD_STAND = {
    **STANDING,
    'ik': {'LeftFoot': {'target': (15.0, 13.0, -8.0), 'pole': KNEE_FORWARD, 'direction': FOOT_FLAT},
           'RightFoot': {'target': (-15.0, 13.0, -8.0), 'pole': KNEE_FORWARD, 'direction': FOOT_FLAT}},
}

LD_LOOK = {
    **LOOK_DOWN,
    'ik': {'LeftFoot': {'target': (15.0, 13.0, -8.0), 'pole': KNEE_FORWARD, 'direction': FOOT_FLAT},
           'RightFoot': {'target': (-15.0, 13.0, -8.0), 'pole': KNEE_FORWARD, 'direction': FOOT_FLAT}},
}

# The weight goes forward onto the left foot. The right foot steps back onto the toes. The right hand reaches down.
LD_STEP_DOWN = {
    'hips': (-3.0, 80.0, 8.0),
    'Hips': ('turn', [('x', 18), ('z', 4)]),
    'Spine': ('turn', [('x', 8)]),
    'Spine1': ('turn', [('x', 6)]),
    'Neck': ('turn', [('x', -4), ('y', -6)]),
    'Head': ('turn', [('x', -6), ('y', -8)]),
    'LeftArm': ('aim', (0.25, -0.9, 0.35)),
    'LeftForeArm': ('aim', (0.25, -0.75, 0.6)),
    'ik': {'LeftFoot': {'target': (15.0, 13.0, -4.0), 'pole': KNEE_FORWARD, 'direction': FOOT_FLAT},
           'RightFoot': {'target': (-14.0, 20.0, -30.0), 'pole': KNEE_FORWARD, 'direction': (0.0, -0.85, 0.5)},
           'RightHand': {'target': (-32.0, 28.0, 34.0), 'pole': ELBOW_OUT, 'direction': HAND_FLOOR}},
}

# Half kneel: the right knee and the right hand are on the floor, the left foot is flat in front.
LD_HALF_KNEEL = {
    'hips': (-6.0, 56.0, 8.0),
    'Hips': ('turn', [('x', 28), ('z', 8)]),
    'Spine': ('turn', [('x', 12), ('z', -3)]),
    'Spine1': ('turn', [('x', 6)]),
    'Neck': ('turn', [('x', -8), ('y', -8)]),
    'Head': ('turn', [('x', -8), ('y', -10)]),
    'LeftArm': ('aim', (0.3, -0.85, 0.45)),
    'LeftForeArm': ('aim', (0.2, -0.65, 0.73)),
    'ik': {'LeftFoot': {'target': (15.0, 13.0, 4.0), 'pole': KNEE_FORWARD, 'direction': FOOT_FLAT},
           'RightFoot': {'target': (-14.0, 16.0, -40.0), 'pole': KNEE_FORWARD, 'direction': FOOT_BACK},
           'RightHand': {'target': (-34.0, 7.0, 34.0), 'pole': ELBOW_OUT, 'direction': HAND_FLOOR}},
}

# Both knees on the floor, the right hand still holds her up.
LD_KNEEL = {
    'hips': (-8.0, 46.0, 4.0),
    'Hips': ('turn', [('x', 24), ('z', 10)]),
    'Spine': ('turn', [('x', 12), ('z', -4)]),
    'Spine1': ('turn', [('x', 6)]),
    'Neck': ('turn', [('x', -4), ('y', -8)]),
    'Head': ('turn', [('x', -4), ('y', -10)]),
    'LeftArm': ('aim', (0.3, -0.85, 0.45)),
    'LeftForeArm': ('aim', (0.2, -0.65, 0.73)),
    'ik': {'LeftFoot': {'target': (14.0, 16.0, -40.0), 'pole': KNEE_FORWARD, 'direction': FOOT_BACK},
           'RightFoot': {'target': (-14.0, 16.0, -40.0), 'pole': KNEE_FORWARD, 'direction': FOOT_BACK},
           'RightHand': {'target': (-34.0, 7.0, 34.0), 'pole': ELBOW_OUT, 'direction': HAND_FLOOR}},
}

# She sits on her right hip, the legs folded to her left, the right hand on the floor beside her.
LD_SIT = {
    **SIT_SIDE,
    'hips': (-4.0, 14.0, 4.0),
    'ik': {'RightHand': {'target': (-38.0, 7.0, 18.0), 'pole': ELBOW_OUT, 'direction': HAND_FLOOR},
           'LeftFoot': {'target': (52.0, 15.0, -12.0), 'pole': KNEE_FORWARD, 'direction': FOOT_BACK},
           'RightFoot': {'target': (38.0, 15.0, -24.0), 'pole': KNEE_FORWARD, 'direction': FOOT_BACK}},
}

# Lowering onto the right forearm, the legs stretch to her left.
LD_RECLINE = {
    'hips': (6.0, 14.0, 2.0),
    'Hips': ('turn', [('z', 62), ('x', 2)]),
    'Spine': ('turn', [('z', -8)]),
    'Spine1': ('turn', [('z', -8)]),
    'Spine2': ('turn', [('z', -8)]),
    'Neck': ('turn', [('z', -14)]),
    'Head': ('turn', [('z', -14), ('x', 4)]),
    'LeftArm': ('aim', (0.55, -0.7, 0.45)),
    'LeftForeArm': ('aim', (0.7, -0.5, 0.5)),
    'ik': {'RightHand': {'target': (-48.0, 8.0, 12.0), 'pole': ELBOW_OUT, 'direction': HAND_FLOOR},
           'LeftFoot': {'target': (78.0, 14.0, -14.0), 'pole': KNEE_FORWARD, 'direction': FOOT_BACK},
           'RightFoot': {'target': (66.0, 14.0, -20.0), 'pole': KNEE_FORWARD, 'direction': FOOT_BACK}},
}

# The end of the lie down: the pose of `LYING`, with the feet on the floor, the top foot on the bottom foot.
LD_LYING = {
    **LYING,
    'ik': {'RightFoot': {'target': (86.0, 11.0, 0.0), 'pole': KNEE_FORWARD, 'direction': (0.6, -0.1, -0.8)},
           'LeftFoot': {'target': (86.0, 20.0, 4.0), 'pole': KNEE_FORWARD, 'direction': (0.6, -0.2, -0.78)}},
}

KEYS = [
    (0.0, LD_STAND),
    (0.9, LD_LOOK),
    (1.9, LD_STEP_DOWN),
    (2.8, LD_HALF_KNEEL),
    (3.6, LD_KNEEL),
    (4.5, LD_SIT),
    (5.5, LD_RECLINE),
    (ENTRY_SECONDS, LD_LYING),
]

GET_UP_KEYS = [
    (0.0, LYING),
    (1.1, PUSH_UP),
    (2.1, SIT_SIDE),
    (3.2, HAND_DOWN),
    (4.2, RISE),
    (GET_UP_SECONDS, STANDING),
]

# How far ahead (+) or behind (-) of the others each bone moves, in seconds. A person turns the head first and the
# body follows. Getting up, the head comes up last.
LIE_DOWN_LEAD = {'Head': 0.3, 'Neck': 0.25, 'Spine2': 0.12, 'Spine1': 0.08, 'RightArm': 0.18, 'RightForeArm': 0.2, 'RightHand': 0.2, 'LeftUpLeg': -0.08, 'RightUpLeg': -0.08, 'LeftLeg': -0.1, 'RightLeg': -0.1}
GET_UP_LEAD = {'Head': -0.3, 'Neck': -0.25, 'Spine2': -0.1, 'RightArm': 0.15, 'RightForeArm': 0.15, 'LeftUpLeg': 0.05, 'RightUpLeg': 0.05}


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


def catmull_rom(p0, p1, p2, p3, t):
    """A point between p1 and p2 on the curve through the four values: the speed does not drop to 0 at a key."""
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def quaternion_curve(q0, q1, q2, q3, t):
    """Catmull-Rom on the four components, on one hemisphere, then normalized. Smooth for the small steps here."""
    near = [q1]
    for q in (q0, q2, q3):
        near.append(q if q.dot(q1) >= 0 else -q)
    # near is [q1, q0, q2, q3] on one hemisphere. The curve goes from q1 (t = 0) to q2 (t = 1).
    p0, p1, p2, p3 = (Vector((q.w, q.x, q.y, q.z)) for q in (near[1], near[0], near[2], near[3]))
    v = catmull_rom(p0, p1, p2, p3, t)
    return Quaternion((v[0], v[1], v[2], v[3])).normalized()


class KeyCurve:
    """The key poses of one motion, ready for sampling: the own rotation of each bone and the hips per key."""

    def __init__(self, table, rest, keys):
        self.table = table
        self.times = [time for time, _ in keys]
        self.own = [own_rotation(pose_deltas(table, rest, key), table) for _, key in keys]
        self.hips = [Vector(key['hips']) for _, key in keys]
        self.duration = self.times[-1]

    def warp(self, seconds):
        """The whole motion starts and ends slowly. Inside, it keeps moving through the keys."""
        u = min(1.0, max(0.0, seconds / self.duration))
        eased = u * u * (3 - 2 * u)
        return (0.35 * u + 0.65 * eased) * self.duration

    def segment(self, seconds):
        seconds = min(max(seconds, 0.0), self.duration)
        if seconds >= self.times[-1]:
            return len(self.times) - 2, 1.0
        index = max(i for i, time in enumerate(self.times) if time <= seconds)
        return index, (seconds - self.times[index]) / (self.times[index + 1] - self.times[index])

    def sample(self, seconds, lead):
        """World rotation per bone and the hips position. `lead` moves some bones ahead of or behind the time."""
        last = len(self.times) - 1
        deltas = {}
        for name, parent, _local in self.table:
            index, t = self.segment(self.warp(seconds + lead.get(name, 0.0)))
            q = [self.own[min(max(i, 0), last)][name] for i in (index - 1, index, index + 1, index + 2)]
            inherited = deltas[parent] if parent else Quaternion()
            deltas[name] = quaternion_curve(q[0], q[1], q[2], q[3], t) @ inherited
        index, t = self.segment(self.warp(seconds))
        h = [self.hips[min(max(i, 0), last)] for i in (index - 1, index, index + 1, index + 2)]
        return deltas, catmull_rom(h[0], h[1], h[2], h[3], t)


# The parts of the body that can touch the floor, with the distance in centimeters from the joint to the floor when
# that part rests on it: the thickness of the flesh, the clothes, and the boots. Used to rest the body on the floor
# and to check, frame by frame, that it does not float or sink.
SUPPORT = {
    'LeftFoot': 8.0, 'RightFoot': 8.0, 'LeftToeBase': 3.0, 'RightToeBase': 3.0,
    'LeftLeg': 10.0, 'RightLeg': 10.0, 'LeftUpLeg': 13.0, 'RightUpLeg': 13.0,
    'Hips': 14.0, 'Spine': 13.0, 'Spine1': 13.0, 'Spine2': 13.0,
    'LeftArm': 7.0, 'RightArm': 7.0, 'LeftForeArm': 4.5, 'RightForeArm': 4.5, 'LeftHand': 4.0, 'RightHand': 4.0,
    'Head': 11.0,
}


def joint_positions(table, rest, translations, deltas, hips):
    """World position of each joint in centimeters (Y up, Z toward the viewer, X to her left) for a posed skeleton."""
    posed = {name: deltas[name] @ rest[name] for name, _, _ in table}
    positions = {}
    for name, parent, _local in table:
        if parent is None:
            positions[name] = Vector(hips)
        else:
            positions[name] = positions[parent] + posed[parent] @ translations[name]
    return positions


def floor_clearance(positions):
    """How far the lowest supporting part is above the floor, in centimeters. 0 means it rests on the floor.

    Also gives the part that is lowest. A negative value means a part is under the floor."""
    low = min(SUPPORT, key=lambda name: positions[name].y - SUPPORT[name])
    return positions[low].y - SUPPORT[low], low


# A part may be this far under the floor, in centimeters, before the hips are lifted: the radii are close, not exact.
FLOOR_TOLERANCE = 0.6
# How far the boot goes past the toe joint, in centimeters.
BOOT_TIP_CM = 7.0
# The height of the ankle of a foot that stands flat, in centimeters.
STAND_ANKLE_CM = 13.0
# The most that the hips descend: a person lowers to the floor at about this pace, not faster.
MAX_DESCENT_CM_PER_SECOND = 70.0

LIMBS = {
    # end joint: (root, middle, positive pole axis name for documentation)
    'LeftFoot': ('LeftUpLeg', 'LeftLeg'),
    'RightFoot': ('RightUpLeg', 'RightLeg'),
    'LeftHand': ('LeftArm', 'LeftForeArm'),
    'RightHand': ('RightArm', 'RightForeArm'),
}


def two_bone(root, target, upper, lower, pole):
    """The middle joint of a two bone chain, and the end joint it reaches, for a target. The pole turns the knee or elbow."""
    to_target = target - root
    reach = min(max(to_target.length, abs(upper - lower) + 0.5), upper + lower - 0.05)
    direction = to_target.normalized()
    along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
    height = math.sqrt(max(upper * upper - along * along, 0.0))
    side = Vector(pole) - direction * Vector(pole).dot(direction)
    side = side.normalized() if side.length > 1e-6 else Vector((0.0, 0.0, 1.0))
    return root + direction * along + side * height, root + direction * reach


class Motion:
    """A motion made of key poses, with contacts. Used for the lie down and for the get up.

    The key poses give the posture of the body (angles, as before). A key can also pin a hand or a foot to a place on
    the floor with `'ik': {'RightHand': {'target': (x, y, z), 'pole': (x, y, z), 'direction': (x, y, z)}}`. The
    app then solves the arm or the leg for that place on every frame, so a planted foot does not slide and a hand
    on the floor stays on the floor. The pin fades in and out between keys.

    The hips height comes from the keys, but never lower than the floor allows: the lowest supporting part of the
    body rests on the floor. So the body does not sink into the floor, and a key that sits on the floor stays on it.
    """

    def __init__(self, table, rest, translations, keys, lead):
        self.table = table
        self.rest = rest
        self.translations = translations
        self.keys = keys
        self.lead = lead
        self.curve = KeyCurve(table, rest, keys)
        self.duration = self.curve.duration
        self._heights = None
        self.lengths = {end: (translations[mid].length, translations[end].length) for end, (_root, mid) in LIMBS.items()}

    def pins(self, seconds):
        """For each pinned end joint: the weight (0 to 1), the target, the pole, and the direction of the end bone."""
        index, t = self.curve.segment(self.curve.warp(seconds))
        eased = smoothstep(t)
        result = {}
        for end in LIMBS:
            a = self.keys[index][1].get('ik', {}).get(end)
            b = self.keys[min(index + 1, len(self.keys) - 1)][1].get('ik', {}).get(end)
            if a is None and b is None:
                continue
            weight = (1.0 if a else 0.0) * (1 - eased) + (1.0 if b else 0.0) * eased
            if weight <= 0.0:
                continue
            ref = [Vector(item[name]) for item, name in ((a, 'target'), (b, 'target')) if item]
            poles = [Vector(item['pole']) for item in (a, b) if item]
            dirs = [Vector(item['direction']) for item in (a, b) if item and 'direction' in item]
            target = ref[0].lerp(ref[-1], eased) if len(ref) == 2 else ref[0]
            pole = poles[0].lerp(poles[-1], eased) if len(poles) == 2 else poles[0]
            direction = (slerp_direction(dirs[0], dirs[-1], eased) if len(dirs) == 2 else dirs[0]) if dirs else None
            target = self._above_floor(end, target, direction)
            result[end] = (weight, target, pole, direction)
        return result

    def _above_floor(self, end, target, direction):
        """Lifts a pinned place so that the toes or the hand never go under the floor while the pin fades."""
        target = Vector(target)
        if end.endswith('Foot'):
            # The boot goes past the toe joint, so the tip of the boot is the lowest point of a foot that points down.
            toe = self.translations[end.replace('Foot', 'ToeBase')].length + BOOT_TIP_CM
            tip_y = target.y + (direction.normalized().y if direction is not None else -0.61) * toe
            # Standing flat, the tip of the boot is at this height: it is the floor level for a tip.
            flat = Vector(FOOT_FLAT).normalized()
            tip_floor = STAND_ANKLE_CM + flat.y * toe
            lowest = min(tip_y - tip_floor, target.y - SUPPORT[end])
        else:
            lowest = target.y - SUPPORT[end]
        if lowest < 0.0:
            target.y -= lowest
        return target

    def pose(self, seconds, hips_y, fk=None):
        """The world rotations and the joint positions for a time and a hips height."""
        deltas_fk, hips_key = fk if fk else self.curve.sample(seconds, self.lead)
        own = own_rotation(deltas_fk, self.table)
        pins = self.pins(seconds)
        hips = Vector((hips_key.x, hips_y, hips_key.z))
        deltas, posed, positions, ik_plan = {}, {}, {}, {}
        up = Vector((0.0, 1.0, 0.0))
        for name, parent, _local in self.table:
            inherited = deltas[parent] if parent else Quaternion()
            deltas[name] = own[name] @ inherited
            posed[name] = deltas[name] @ self.rest[name]
            positions[name] = hips.copy() if parent is None else positions[parent] + posed[parent] @ self.translations[name]
            # Which limb bone is this, and is its end joint pinned?
            for end, (root, middle) in LIMBS.items():
                pin = pins.get(end)
                if pin is None:
                    continue
                weight, target, pole, direction = pin
                end_bone = end
                if name == root:
                    upper, lower = self.lengths[end]
                    knee, reach = two_bone(positions[name], target, upper, lower, pole)
                    ik_plan[end] = (knee, reach)
                    wanted = (knee - positions[name]).normalized()
                    self._aim(name, inherited, wanted, weight, deltas, posed, up)
                elif name == middle:
                    reach = ik_plan[end][1]
                    wanted = (reach - positions[name]).normalized()
                    self._aim(name, inherited, wanted, weight, deltas, posed, up)
                elif name == end_bone and direction is not None:
                    self._aim(name, inherited, direction.normalized(), weight, deltas, posed, up)
        return deltas, positions, hips

    def _aim(self, name, inherited, wanted, weight, deltas, posed, up):
        """Turns the bone toward a world direction, by `weight`, from what the key pose gave."""
        current = posed[name] @ up
        direction = slerp_direction(current, wanted, weight)
        base = (inherited @ self.rest[name]) @ up
        deltas[name] = aim(base, direction) @ inherited
        posed[name] = deltas[name] @ self.rest[name]

    def _lowest_hips(self, seconds, fk):
        """The first hips height at or above the key where no part is under the floor."""
        key_y = fk[1].y

        def clearance(y):
            _deltas, positions, _hips = self.pose(seconds, y, fk)
            return floor_clearance(positions)[0]

        y = key_y
        for _ in range(60):
            if clearance(y) >= -FLOOR_TOLERANCE:
                return y
            y += 1.0
        # No height clears the floor for this frame. Keep the key: a small dip is better than a jump.
        return key_y

    def _hips_heights(self):
        """The hips height on every frame. It rises at once when the floor needs it, and it descends at a person's pace."""
        heights = []
        for frame in range(int(round(self.duration * FPS)) + 1):
            seconds = frame / FPS
            fk = self.curve.sample(seconds, self.lead)
            wanted = self._lowest_hips(seconds, fk)
            if heights:
                wanted = max(wanted, heights[-1] - MAX_DESCENT_CM_PER_SECOND / FPS)
            heights.append(wanted)
        return heights

    def sample(self, seconds):
        """The world rotations and the hips position for a time, with the hips resting on the floor."""
        if self._heights is None:
            self._heights = self._hips_heights()
        frame = min(max(int(round(seconds * FPS)), 0), len(self._heights) - 1)
        fk = self.curve.sample(seconds, self.lead)
        deltas, _positions, hips = self.pose(seconds, self._heights[frame], fk)
        return deltas, hips


def breathing(table, motion, seconds):
    """The lying pose with a sleeping breath of the chest and a slow settle of the head and the top leg."""
    deltas, hips = motion.sample(motion.duration)
    # 0 at the start of the loop, so the loop starts on the last frame of the entry.
    inhale = breath(seconds)
    slow = 2 * math.pi * seconds / LOOP_SECONDS
    extra = {
        'Spine1': rot('x', -1.6 * inhale) @ rot('z', 1.0 * inhale),
        'Spine2': rot('x', -2.4 * inhale) @ rot('z', 1.4 * inhale),
        'Head': rot('z', 1.2 * math.sin(slow)) @ rot('x', -0.8 * math.sin(slow)),
        'LeftUpLeg': rot('z', 0.8 * math.sin(slow + 1.0)),
        'LeftArm': rot('z', 0.6 * math.sin(slow + 0.5)),
    }
    own = own_rotation(deltas, table)
    result = {}
    for name, parent, _local in table:
        inherited = result[parent] if parent else Quaternion()
        result[name] = (extra.get(name, Quaternion()) @ own[name]) @ inherited
    return result, hips + Vector((0.0, 0.5 * inhale, 0.0))


def local_rotations(table, rest, deltas):
    """Local rotation of each bone in the convention of the FBX file: relative to the posed parent."""
    locals_ = {}
    posed = {name: deltas[name] @ rest[name] for name, _, _ in table}
    for name, parent, _local in table:
        locals_[name] = (posed[parent].inverted() @ posed[name]) if parent else posed[name]
    return locals_


def animation_frames(table, rest, translations, mode):
    frames = []
    if mode == 'check-rest':
        locals_ = local_rotations(table, rest, {name: Quaternion() for name, _, _ in table})
        return [(locals_, Vector(STANDING['hips']))] * 2
    if mode == 'get-up':
        motion = Motion(table, rest, translations, GET_UP_KEYS, GET_UP_LEAD)
        for frame in range(int(round(GET_UP_SECONDS * FPS)) + 1):
            deltas, hips = motion.sample(frame / FPS)
            frames.append((local_rotations(table, rest, deltas), hips))
        return frames
    motion = Motion(table, rest, translations, KEYS, LIE_DOWN_LEAD)
    total = int(round((ENTRY_SECONDS + LOOP_SECONDS) * FPS)) + 1
    for frame in range(total):
        seconds = frame / FPS
        if seconds <= ENTRY_SECONDS:
            deltas, hips = motion.sample(seconds)
        else:
            deltas, hips = breathing(table, motion, seconds - ENTRY_SECONDS)
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


def analyze(table, rest, armature, mode):
    """Prints one line for each frame: the time, the hips, the floor clearance, and the speed. For checking the motion."""
    translations = {name: values[1] for name, values in blender_rest(armature).items()}
    keys, lead = (GET_UP_KEYS, GET_UP_LEAD) if mode == 'get-up' else (KEYS, LIE_DOWN_LEAD)
    motion = Motion(table, rest, translations, keys, lead)
    print('t, hips_y, clearance, lowest, hips_speed_m_s, head_y, rhand_h, lhand_h, rknee_h, lknee_h, rfoot_h, lfoot_h, rfoot_xz, lfoot_xz')
    previous = None
    for frame in range(int(round(motion.duration * FPS)) + 1):
        seconds = frame / FPS
        deltas, hips = motion.sample(seconds)
        positions = joint_positions(table, rest, translations, deltas, hips)
        clearance, lowest = floor_clearance(positions)
        speed = 0.0 if previous is None else (hips - previous).length / 100.0 * FPS
        previous = hips.copy()
        if frame % 3 == 0:
            h = lambda name, r: positions[name].y - r
            xz = lambda name: f'({positions[name].x:.0f};{positions[name].z:.0f})'
            print(f'{seconds:.2f}, {hips.y:.1f}, {clearance:.1f}, {lowest}, {speed:.2f}, {positions["Head"].y:.0f}, {h("RightHand", 4):.0f}, {h("LeftHand", 4):.0f}, {h("RightLeg", 7):.0f}, {h("LeftLeg", 7):.0f}, {h("RightFoot", 8):.0f}, {h("LeftFoot", 8):.0f}, {xz("RightFoot")}, {xz("LeftFoot")}')


def smoothness(table, rest, armature, mode):
    """Looks for jumps: the hips speed and the speed change on each frame, and the joints that move too fast."""
    translations = {name: values[1] for name, values in blender_rest(armature).items()}
    keys, lead = (GET_UP_KEYS, GET_UP_LEAD) if mode == 'get-up' else (KEYS, LIE_DOWN_LEAD)
    motion = Motion(table, rest, translations, keys, lead)
    previous, speeds, worst = None, [], []
    last_positions = None
    for frame in range(int(round(motion.duration * FPS)) + 1):
        deltas, hips = motion.sample(frame / FPS)
        positions = joint_positions(table, rest, translations, deltas, hips)
        if previous is not None:
            speeds.append((frame / FPS, (hips - previous).length / 100.0 * FPS, (hips.y - previous.y) / 100.0 * FPS))
            fastest = max(((positions[n] - last_positions[n]).length / 100.0 * FPS, n) for n in positions)
            worst.append((frame / FPS, fastest[0], fastest[1]))
        previous, last_positions = hips.copy(), positions
    print('hips: top speeds in m/s (time, speed, vertical speed)')
    for item in sorted(speeds, key=lambda x: -x[1])[:6]:
        print(f'  {item[0]:.2f}s  {item[1]:.2f}  {item[2]:+.2f}')
    print('fastest joint (time, speed m/s, joint)')
    for item in sorted(worst, key=lambda x: -x[1])[:8]:
        print(f'  {item[0]:.2f}s  {item[1]:.2f}  {item[2]}')
    jumps = [(t, b[1] - a[1]) for (t, *_), a, b in zip(speeds[1:], speeds, speeds[1:]) if abs(b[1] - a[1]) > 0.35]
    print('speed jumps over 0.35 m/s between frames:', [f'{t:.2f}s' for t, _ in jumps])


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    skeleton, output = Path(argv[0]), Path(argv[1])
    mode = 'check-rest' if '--check-rest' in argv[2:] else 'get-up' if '--get-up' in argv[2:] else 'lie-down'
    table = read_rest_table()
    rest = world_rest(table)
    armature = import_skeleton(skeleton)
    if '--analyze' in argv[2:]:
        analyze(table, rest, armature, mode)
        return
    if '--smooth' in argv[2:]:
        smoothness(table, rest, armature, mode)
        return
    frames = animation_frames(table, rest, {name: values[1] for name, values in blender_rest(armature).items()}, mode)
    write_animation(armature, frames)
    export(armature, output)
    print(f'wrote {output} with {len(frames)} frames at {FPS} fps')


if __name__ == '__main__':
    main(sys.argv[1:])
