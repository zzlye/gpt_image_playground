import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { queryNewApiModelUnitCost } from './newApi'

describe('newApi model unit cost', () => {
  it('uses ModelPrice from status without waiting for slower pricing endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        'general_setting.custom_currency_symbol': 'HUHN',
        ModelPrice: JSON.stringify({
          'gpt-image-2': 0.06,
          'nano-banana-2': 0.09,
        }),
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const result = await queryNewApiModelUnitCost({
      ...DEFAULT_SETTINGS.profiles[0],
      baseUrl: 'https://zzlye.xyz:60/v1',
      apiKey: 'test-key',
      model: 'nano-banana-2',
    })

    expect(result).toMatchObject({ text: 'HUHN 0.09', found: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
