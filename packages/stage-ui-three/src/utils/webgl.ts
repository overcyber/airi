/** State of the WebGL context of a scene. */
export type WebGLState = 'ok' | 'unavailable' | 'lost'

/**
 * Tells if this page can create a WebGL context now.
 *
 * Chrome refuses new contexts for a site after the GPU process fails a few times, and three then
 * throws "Error creating WebGL context" while the scene mounts. A probe first lets the scene show a
 * message in place of a broken page. The probe context is released at once.
 */
export function canCreateWebGLContext(doc: Pick<Document, 'createElement'> | undefined = globalThis.document): boolean {
  if (!doc)
    return false
  try {
    const canvas = doc.createElement('canvas')
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!context)
      return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  }
  catch {
    return false
  }
}

/** Tells if an error is the failure of three to create its WebGL context. */
export function isWebGLContextError(error: unknown): boolean {
  return error instanceof Error && /WebGL context/i.test(error.message)
}
