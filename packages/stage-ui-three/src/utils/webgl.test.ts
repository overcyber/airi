import { describe, expect, it, vi } from 'vitest'

import { canCreateWebGLContext, isWebGLContextError } from './webgl'

function documentWith(getContext: (kind: string) => unknown) {
  return { createElement: () => ({ getContext }) } as unknown as Document
}

describe('canCreateWebGLContext', () => {
  it('is true when the browser gives a context, and releases the probe context', () => {
    const loseContext = vi.fn()
    const doc = documentWith(kind => kind === 'webgl2' ? { getExtension: () => ({ loseContext }) } : null)

    expect(canCreateWebGLContext(doc)).toBe(true)
    expect(loseContext).toHaveBeenCalledOnce()
  })

  it('is false when the browser refuses WebGL, or throws', () => {
    expect(canCreateWebGLContext(documentWith(() => null))).toBe(false)
    expect(canCreateWebGLContext(documentWith(() => {
      throw new Error('blocked')
    }))).toBe(false)
    expect(canCreateWebGLContext(undefined)).toBe(false)
  })
})

describe('isWebGLContextError', () => {
  it('finds the error of three for a refused context', () => {
    expect(isWebGLContextError(new Error('THREE.WebGLRenderer: Error creating WebGL context.'))).toBe(true)
    expect(isWebGLContextError(new Error('other'))).toBe(false)
  })
})
