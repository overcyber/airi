import { AnimationClip, QuaternionKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'

import { additiveClip, emoteLayerBones, inferEmoteLayering, maskClip } from './motion-layers'

describe('inferEmoteLayering', () => {
  it('puts a head nod on the head, additive, and a wave on the arms', () => {
    expect(inferEmoteLayering({ name: 'Head Nod' })).toEqual({ layer: 'head', additive: true })
    expect(inferEmoteLayering({ name: 'Head_Shake' })).toEqual({ layer: 'head', additive: true })
    expect(inferEmoteLayering({ name: 'Wave Hello' })).toEqual({ layer: 'arms', additive: false })
    expect(inferEmoteLayering({ name: 'emote-peace-sign', description: 'Peace sign' })).toEqual({ layer: 'arms', additive: false })
    expect(inferEmoteLayering({ name: 'Arms Open' })).toEqual({ layer: 'upper', additive: false })
  })

  it('keeps the full body for a dance, a bow, or a spin, and for Portuguese text without a gesture word', () => {
    expect(inferEmoteLayering({ name: 'Rumba' }).layer).toBe('full')
    expect(inferEmoteLayering({ name: 'Bow' }).layer).toBe('full')
    expect(inferEmoteLayering({ name: 'spin', description: 'gira no lugar' }).layer).toBe('full')
  })
})

describe('emoteLayerBones', () => {
  it('has the hands and fingers in the arms, and the head in the upper body', () => {
    expect(emoteLayerBones.arms).toContain('leftHand')
    expect(emoteLayerBones.arms).toContain('rightIndexProximal')
    expect(emoteLayerBones.upper).toContain('head')
    expect(emoteLayerBones.upper).not.toContain('hips')
  })
})

describe('maskClip', () => {
  const clip = new AnimationClip('c', 1, ['hips', 'head'].map(node => new QuaternionKeyframeTrack(`${node}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])))

  it('keeps or drops the tracks of the nodes, and gives the same copy again', () => {
    const nodes = new Set(['head'])
    expect(maskClip(clip, nodes, 'keep').tracks.map(track => track.name)).toEqual(['head.quaternion'])
    expect(maskClip(clip, nodes, 'drop').tracks.map(track => track.name)).toEqual(['hips.quaternion'])
    expect(maskClip(clip, new Set(['head']), 'keep')).toBe(maskClip(clip, nodes, 'keep'))
    expect(clip.tracks).toHaveLength(2)
  })

  it('makes an additive copy once', () => {
    expect(additiveClip(clip)).toBe(additiveClip(clip))
    expect(additiveClip(clip)).not.toBe(clip)
  })
})
