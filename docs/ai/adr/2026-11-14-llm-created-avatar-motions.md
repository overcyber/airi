# Avatar motions that an LLM creates

Status: proposed. The project owner asked for this feature on 2026-11-14 (Plan 12). It changes one non-goal of Plan 01.

## Context

- Plan 01 lists "control each bone directly with LLM tokens" as a non-goal.
- The ADR of the motion contracts v1 (`2026-11-04-alice-motion-contracts-v1.md`) says that only the scheduler writes bone rotations.
- The old mirror (`neoalice_moves.mjs` of the TalkingHead avatar) let NeoAlice define a gesture or a pose with `defineGesture` and `definePose`. The project owner wants the same on AIRI.
- The owner also wants:
  - a database of the bones and face shapes of the avatar;
  - saved motions that he can list and replay.

## Decision

- An LLM can send a whole pose or movement. It does not stream bone values token by token. A motion is one checked message:
  - key frames of anatomical axes in degrees (`format: "bones"`), or
  - a TalkingHead template (`format: "talkinghead"`).
- `packages/alice-motion/src/avatar-rig.ts` defines the bones, their axes, the human limits of each axis, and the face shapes.
- `parseCustomMotion` (`custom-motion.ts`):
  - clamps every value to its limit;
  - drops unknown bones, axes, and face shapes;
  - returns warnings for what it changed.
- A motion has a limit of 64 KB. The 4096 byte limit of `MotionIntent` and `MotionCue` does not change, because a motion is not an intent.
- The renderer plays a motion through the animator, like any other clip. Nothing writes bones outside the animation layers.
- Named motions with `save` go to the companion service. It keeps them in `movimentos.json` and publishes the library, retained, on `evt/avatar/motions`.

## Consequences

- NeoAlice can create, play, and save motions with:
  - `cmd/avatar/motion`;
  - `cmd/avatar` with `defineGesture` and `definePose`;
  - the tools `avatar_motion` and `avatar_rig` through `cmd/avatar/tool`.
- A bad motion cannot bend a joint past its limit. It can still look odd, so the warnings go back to the log of the stage.
- The broker has no access control. Any device on the network can play or save a motion, as it can already send a pose.
