import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultFalProfile, createDefaultOpenAIProfile } from './apiProfiles'
import { fetchOpenAICompatibleModels, parseModelListPayload } from './modelList'

function createOkResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('parseModelListPayload', () => {
  it('parses OpenAI-style { data: [{ id }] }', () => {
    expect(parseModelListPayload({
      data: [{ id: 'gpt-image-1' }, { id: 'gpt-4o' }, { id: 'dall-e-3' }],
    })).toEqual(['dall-e-3', 'gpt-4o', 'gpt-image-1'])
  })

  it('parses { models: [{ id }] }', () => {
    expect(parseModelListPayload({
      models: [{ id: 'b' }, { id: 'a' }],
    })).toEqual(['a', 'b'])
  })

  it('parses a bare array', () => {
    expect(parseModelListPayload(['c', 'a', 'b'])).toEqual(['a', 'b', 'c'])
  })

  it('falls back to name / model fields and trims', () => {
    expect(parseModelListPayload({
      data: [
        { name: ' some-name ' },
        { model: 'm' },
        { id: '', name: '', model: 'x' },
      ],
    })).toEqual(['m', 'some-name', 'x'])
  })

  it('dedupes', () => {
    expect(parseModelListPayload({
      data: [{ id: 'a' }, { id: 'a' }, { id: 'b' }],
    })).toEqual(['a', 'b'])
  })

  it('returns empty for unrecognised shapes', () => {
    expect(parseModelListPayload(null)).toEqual([])
    expect(parseModelListPayload({})).toEqual([])
    expect(parseModelListPayload({ data: 'not-an-array' })).toEqual([])
  })
})

describe('fetchOpenAICompatibleModels', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects fal provider before issuing a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const profile = createDefaultFalProfile({ apiKey: 'fal-key' })
    await expect(fetchOpenAICompatibleModels(profile)).rejects.toThrow(/fal\.ai/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects when apiKey is missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const profile = createDefaultOpenAIProfile({ apiKey: '' })
    await expect(fetchOpenAICompatibleModels(profile)).rejects.toThrow(/API Key/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects when baseUrl is empty', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const profile = createDefaultOpenAIProfile({ apiKey: 'sk-x', baseUrl: '' })
    await expect(fetchOpenAICompatibleModels(profile)).rejects.toThrow(/API URL/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns sorted models on a 200 OpenAI-style response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createOkResponse({
      data: [{ id: 'gpt-4o' }, { id: 'gpt-image-1' }, { id: 'dall-e-3' }],
    }))
    const profile = createDefaultOpenAIProfile({ apiKey: 'sk-test' })
    const result = await fetchOpenAICompatibleModels(profile)
    expect(result.models).toEqual(['dall-e-3', 'gpt-4o', 'gpt-image-1'])
    expect(typeof result.fetchedAt).toBe('number')
  })

  it('sends Bearer auth and hits /models path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createOkResponse({
      data: [{ id: 'a' }],
    }))
    const profile = createDefaultOpenAIProfile({ apiKey: 'sk-test', baseUrl: 'https://api.example.com/v1' })
    await fetchOpenAICompatibleModels(profile)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.example.com/v1/models')
    expect(init?.method).toBe('GET')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('translates HTTP errors via getApiErrorMessage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Invalid API key' },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
    const profile = createDefaultOpenAIProfile({ apiKey: 'sk-bad' })
    await expect(fetchOpenAICompatibleModels(profile)).rejects.toThrow('Invalid API key')
  })

  it('propagates network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const profile = createDefaultOpenAIProfile({ apiKey: 'sk-test' })
    await expect(fetchOpenAICompatibleModels(profile)).rejects.toThrow('Failed to fetch')
  })

  it('throws a friendly error when payload is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not-json', { status: 200 }))
    const profile = createDefaultOpenAIProfile({ apiKey: 'sk-test' })
    await expect(fetchOpenAICompatibleModels(profile)).rejects.toThrow(/JSON/)
  })

  it('throws when the response has no recognisable model list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createOkResponse({ data: [] }))
    const profile = createDefaultOpenAIProfile({ apiKey: 'sk-test' })
    await expect(fetchOpenAICompatibleModels(profile)).rejects.toThrow(/未在响应中识别到模型列表/)
  })
})
