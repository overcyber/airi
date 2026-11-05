import { afterEach, describe, expect, it, vi } from 'vitest'

import { useThemeColor } from './theme-color'

// The module also exports the background sampling, which imports Vue components and stores.
// `useThemeColor` uses none of them.
vi.mock('@proj-airi/stage-ui/libs', () => ({ colorFromElement: vi.fn(), patchThemeSamplingHtml2CanvasClone: vi.fn() }))
vi.mock('@proj-airi/stage-ui/stores/settings', () => ({ useSettings: vi.fn() }))
vi.mock('@proj-airi/ui', () => ({ useTheme: vi.fn() }))
vi.mock('../stores/background', () => ({ BackgroundKind: { Wave: 'wave', Transparent: 'transparent' } }))

describe('useThemeColor', () => {
  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('writes the color to the theme-color meta tag as hex', async () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">'
    await useThemeColor(() => 'rgb(255 0 0)').updateThemeColor()

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f00')
  })

  it('keeps the last color when the source has no color yet, for example during a model change', async () => {
    document.head.innerHTML = '<meta name="theme-color" content="#123456">'

    await expect(useThemeColor(async () => '').updateThemeColor()).resolves.toBeUndefined()
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#123456')
  })
})
