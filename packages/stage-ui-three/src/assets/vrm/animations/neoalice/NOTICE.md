# NeoAlice animations

These FBX files are motions of the NeoAlice avatar. The repository owner made them with keyframes in Blender
(`new_moves.py` of the owner's TalkingHead NeoAlice project), on the Ready Player Me skeleton, in the Mixamo
convention that TalkingHead plays. The owner added them on 2026-11-07 under the Apache-2.0 license.

They are the same files that the mirror plays from `animations_arkit/` of the TalkingHead server. AIRI ships them,
so the web, desktop, and mobile apps play them without the Alice server. The FBX retarget of stage-ui-three
(`composables/vrm/fbx-retarget.ts`) maps them to any VRM.

| File here | File of the TalkingHead server | Motion |
| --- | --- | --- |
| `arms-open.fbx` | `Arms_Open.fbx` | Open both arms |
| `bow.fbx` | `Bow.fbx` | Bow |
| `breathing-idle.fbx` | `Breathing_Idle.fbx` | Breathe while standing |
| `celebrate.fbx` | `Celebrate.fbx` | Celebrate with both arms |
| `head-nod.fbx` | `Head_Nod.fbx` | Nod yes |
| `head-shake.fbx` | `Head_Shake.fbx` | Shake the head no |
| `look-around.fbx` | `Look_Around.fbx` | Look around |
| `point-forward.fbx` | `Point_Forward.fbx` | Point forward |
| `thinking.fbx` | `Thinking.fbx` | Think, hand to the chin |
| `wave-hello.fbx` | `Wave_Hello.fbx` | Wave hello |

The animations of the Ready Player Me library (`Talking_0`, `Rumba`, and others) and of Mixamo (`walking`, `dance`)
are not here: their licenses do not permit redistribution in a public repository. The Alice Docker server takes them
from the TalkingHead folders (`deploy/alice/animacoes`) or from the TalkingHead server (`AIRI_TALKINGHEAD_UPSTREAM`).
