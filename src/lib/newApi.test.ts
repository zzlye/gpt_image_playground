import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { queryNewApiModelUnitCost, queryNewApiPriceTable } from './newApi'

describe('newApi model unit cost', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('collects NewAPI model prices for the price table', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          'general_setting.custom_currency_symbol': 'HUHN',
          ModelPrice: JSON.stringify({
            'gpt-image-2': 0.06,
            'gpt-image-2-vip': 0.15,
          }),
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValue(new Response(JSON.stringify({}), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }))

    const result = await queryNewApiPriceTable({
      ...DEFAULT_SETTINGS.profiles[0],
      baseUrl: 'https://zzlye.xyz:60/v1',
      apiKey: 'test-key',
    })

    expect(result.found).toBe(true)
    expect(result.items).toEqual([
      { model: 'gpt-image-2', rawPrice: 0.06, text: 'HUHN 0.06' },
      { model: 'gpt-image-2-vip', rawPrice: 0.15, text: 'HUHN 0.15' },
    ])
  })

  it('reads the NewAPI pricing data array when status has no model price map', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          'general_setting.custom_currency_symbol': 'HUHN',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: [
          { model_name: 'gpt-image-2', model_price: 0.06 },
          { model_name: 'gpt-image-2-vip', model_price: 0.15 },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    const result = await queryNewApiPriceTable({
      ...DEFAULT_SETTINGS.profiles[0],
      baseUrl: 'https://example.com/v1',
      apiKey: 'test-key',
    })

    expect(result.found).toBe(true)
    expect(result.items).toEqual([
      { model: 'gpt-image-2', rawPrice: 0.06, text: 'HUHN 0.06' },
      { model: 'gpt-image-2-vip', rawPrice: 0.15, text: 'HUHN 0.15' },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/api/pricing')
  })

  it('does not request protected price endpoints without an access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          'general_setting.custom_currency_symbol': 'HUHN',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    const result = await queryNewApiPriceTable({
      ...DEFAULT_SETTINGS.profiles[0],
      baseUrl: 'https://example.com/v1',
      apiKey: '',
    })

    expect(result).toMatchObject({ found: false, items: [] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
