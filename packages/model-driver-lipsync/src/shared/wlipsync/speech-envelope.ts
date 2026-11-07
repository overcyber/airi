/** The volume range that {@link SpeechEnvelope} sets on the wLipSync node, in log10 of the RMS. */
const nodeMinLogVolume = -3
const nodeMaxLogVolume = 0
/** Speech that is this far under the recent peak, in log10 of the RMS (10 dB), closes the mouth. */
const rangeDecades = 0.5
/** The recent peak falls by this much each second, so a quieter voice opens the mouth fully again after a moment. */
const peakDecayDecadesPerSecond = 0.25
/** The peak never falls under this level (RMS 0.01), so room noise between sentences does not open the mouth. */
const peakFloorLogVolume = -2

/** The part of the wLipSync node that {@link SpeechEnvelope} reads and configures. */
export interface WLipSyncVolumeSource {
  minVolume: number
  maxVolume: number
  volume: number
}

/**
 * Loudness of speech relative to its recent peak, from 0 (silence) to 1 (a stressed syllable).
 *
 * The wLipSync node maps log10 of the RMS from -2.5 to -1.5 onto 0 to 1. Normal TTS speech is at -1.6 to -0.7, so
 * the node volume stays at 1 for the whole sentence and the mouth never closes between syllables. This class sets a
 * wide range on the node and follows the peak of the voice, so each syllable opens the mouth and each gap closes it.
 *
 * @example
 * const envelope = new SpeechEnvelope()
 * envelope.configure(node)
 * const volume = envelope.update(node.volume, deltaSeconds)
 */
export class SpeechEnvelope {
  private peak = peakFloorLogVolume

  /** Sets the volume range of the node that this envelope reads. */
  configure(node: WLipSyncVolumeSource) {
    node.minVolume = nodeMinLogVolume
    node.maxVolume = nodeMaxLogVolume
  }

  /** Clears the peak, for example after the speech ends. */
  reset() {
    this.peak = peakFloorLogVolume
  }

  /**
   * Reads the node volume of one frame and returns the loudness from 0 to 1.
   *
   * @param nodeVolume - The `volume` of a node that {@link configure} set up.
   * @param deltaSeconds - The elapsed render time.
   */
  update(nodeVolume: number, deltaSeconds: number): number {
    const logVolume = nodeMinLogVolume + Math.min(Math.max(nodeVolume, 0), 1) * (nodeMaxLogVolume - nodeMinLogVolume)
    this.peak = Math.max(logVolume, this.peak - peakDecayDecadesPerSecond * Math.max(deltaSeconds, 0), peakFloorLogVolume)
    return Math.min(Math.max((logVolume - (this.peak - rangeDecades)) / rangeDecades, 0), 1)
  }
}
