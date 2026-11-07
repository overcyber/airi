import { describe, expect, it } from 'vitest'

import { ptBrVisemes } from './pt-br'

const shapes = (text: string) => ptBrVisemes(text).map(step => step.viseme).join(' ')

describe('ptBrVisemes', () => {
  it('closes the lips on p, b, and m before a vowel', () => {
    expect(shapes('papai')).toBe('PP aa PP aa I')
    expect(shapes('bom')).toBe('PP O')
    expect(shapes('mamãe')).toBe('PP aa PP aa I')
  })

  it('reads the Brazilian sounds of ti, di, a final e and o, and a final l', () => {
    expect(shapes('dia')).toBe('CH I aa')
    expect(shapes('noite')).toBe('nn O I CH I')
    expect(shapes('carro')).toBe('kk aa RR U')
    expect(shapes('Brasil')).toBe('PP RR aa SS I U')
  })

  it('reads ch, lh, nh, qu, gu, a soft c and g, and ão', () => {
    expect(shapes('chá')).toBe('CH aa')
    expect(shapes('filho')).toBe('FF I nn U')
    expect(shapes('quero')).toBe('kk E RR U')
    expect(shapes('gente')).toBe('CH E CH I')
    expect(shapes('cidade')).toBe('SS I DD aa CH I')
    expect(shapes('não')).toBe('nn aa U')
  })

  it('pauses on commas and at the end of a sentence', () => {
    const steps = ptBrVisemes('Olá, tudo bem?')
    expect(steps.filter(step => step.viseme === 'sil').map(step => step.units)).toEqual([2, 3.5])
    expect(shapes('tudo bem')).toBe('DD U DD U PP E I')
  })
})
