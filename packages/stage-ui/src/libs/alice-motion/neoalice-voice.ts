import type { SpeechSegment } from '@proj-airi/alice-motion'

import { SpeechSegmenter } from '@proj-airi/alice-motion'
import { toWAVBase64 } from '@proj-airi/audio/encoding'

import * as v from 'valibot'

import vadWorkletUrl from '../../workers/vad/process.worklet?worker&url'

/** The microphone audio goes to NeoAlice at this rate, the rate of the NeoAlice Whisper. */
export const neoAliceVoiceSampleRate = 16000

const NeoAliceAudioReplySchema = v.looseObject({
  text: v.optional(v.nullable(v.string()), ''),
  intent: v.optional(v.nullable(v.string()), ''),
  audio_base64: v.optional(v.nullable(v.string()), ''),
})

export interface NeoAliceAudioRequest {
  /** Base URL of the NeoAlice API, with a trailing slash. The Alice Docker server forwards `/proxy/neoalice/`. */
  apiBaseUrl: string
  userId: string
  sessionId: string
  /** WAV audio in base64. */
  audioBase64: string
  /** `true` asks NeoAlice to put the spoken reply in the response. */
  returnAudio: boolean
}

export interface NeoAliceAudioReply {
  text: string
  intent: string
  audioBase64: string
}

/**
 * Sends one spoken phrase to the `/audio` route of the NeoAlice API.
 *
 * NeoAlice transcribes it, answers, and, with `returnAudio`, returns the spoken reply.
 * The API key is not here: the proxy of the server adds it.
 */
export async function sendNeoAliceAudio(request: NeoAliceAudioRequest, fetchApi: typeof fetch = globalThis.fetch, signal?: AbortSignal): Promise<NeoAliceAudioReply> {
  const response = await fetchApi(new URL('audio', request.apiBaseUrl).href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      user_id: request.userId,
      session_id: request.sessionId,
      audio_base64: request.audioBase64,
      return_audio: request.returnAudio,
    }),
    signal,
  })
  if (!response.ok)
    throw new Error(`NeoAlice answered ${response.status} ${response.statusText}`.trim())
  const parsed = v.safeParse(NeoAliceAudioReplySchema, await response.json())
  if (!parsed.success)
    throw new Error('NeoAlice sent a reply that is not valid')
  return {
    text: parsed.output.text ?? '',
    intent: parsed.output.intent ?? '',
    audioBase64: parsed.output.audio_base64 ?? '',
  }
}

/** WAV in base64 of one segment, for `sendNeoAliceAudio`. */
export function segmentToWavBase64(segment: SpeechSegment) {
  return toWAVBase64(segment.samples.buffer, segment.sampleRate)
}

/**
 * Microphone of the avatar for NeoAlice. It cuts the audio into phrases with `SpeechSegmenter`.
 *
 * It owns its audio context at 16 kHz and its microphone stream. While `paused` is `true`, for
 * example while the avatar speaks, it drops the audio, so the avatar does not hear itself.
 */
export class NeoAliceMicrophone {
  paused = false
  private context: AudioContext | undefined
  private stream: MediaStream | undefined
  private node: AudioWorkletNode | undefined
  private readonly segmenter = new SpeechSegmenter({ sampleRate: neoAliceVoiceSampleRate })

  constructor(private readonly onSegment: (segment: SpeechSegment) => void) {}

  get running() {
    return this.context !== undefined
  }

  async start(deviceId?: string) {
    if (this.context)
      return
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    const context = new AudioContext({ sampleRate: neoAliceVoiceSampleRate, latencyHint: 'interactive' })
    try {
      await context.audioWorklet.addModule(vadWorkletUrl)
      const node = new AudioWorkletNode(context, 'vad-audio-worklet-processor')
      node.port.onmessage = (event: MessageEvent<{ buffer?: Float32Array }>) => {
        const buffer = event.data.buffer
        if (!buffer || buffer.length === 0)
          return
        if (this.paused) {
          this.segmenter.reset()
          return
        }
        const segment = this.segmenter.push(buffer)
        if (segment)
          this.onSegment(segment)
      }
      // The worklet runs only while its output reaches the destination. A zero gain keeps it silent.
      const silent = context.createGain()
      silent.gain.value = 0
      context.createMediaStreamSource(stream).connect(node)
      node.connect(silent)
      silent.connect(context.destination)
      if (context.state === 'suspended')
        await context.resume()
      this.context = context
      this.stream = stream
      this.node = node
    }
    catch (error) {
      for (const track of stream.getTracks())
        track.stop()
      await context.close().catch(() => {})
      throw error
    }
  }

  async stop() {
    this.node?.port.close()
    this.node?.disconnect()
    for (const track of this.stream?.getTracks() ?? [])
      track.stop()
    const context = this.context
    this.context = undefined
    this.stream = undefined
    this.node = undefined
    this.segmenter.reset()
    await context?.close().catch(() => {})
  }
}
