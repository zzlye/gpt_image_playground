import type { ApiProfile } from '../types'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'
import { getApiErrorMessage } from './imageApiShared'

export interface FetchModelsResult {
  models: string[]
  fetchedAt: number
}

const MODEL_LIST_TIMEOUT_MS = 30_000

function extractModelId(item: unknown): string | null {
  if (typeof item === 'string') return item.trim() || null
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  for (const key of ['id', 'name', 'model']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function pickRawList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  if (Array.isArray(record.data)) return record.data
  if (Array.isArray(record.models)) return record.models
  return []
}

export function parseModelListPayload(payload: unknown): string[] {
  const raw = pickRawList(payload)
  const ids = new Set<string>()
  for (const item of raw) {
    const id = extractModelId(item)
    if (id) ids.add(id)
  }
  return Array.from(ids).sort((a, b) => a.localeCompare(b))
}

export async function fetchOpenAICompatibleModels(
  profile: ApiProfile,
  signal?: AbortSignal,
): Promise<FetchModelsResult> {
  if (profile.provider === 'fal') {
    throw new Error('fal.ai 暂不支持拉取模型列表')
  }
  if (!profile.baseUrl.trim()) {
    throw new Error('请先填写 API URL')
  }
  if (!profile.apiKey.trim()) {
    throw new Error('请先填写 API Key')
  }

  const proxyConfig = readClientDevProxyConfig()
  const useApiProxy = shouldUseApiProxy(profile.apiProxy, proxyConfig)
  const url = buildApiUrl(profile.baseUrl, 'models', proxyConfig, useApiProxy)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response))
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('响应不是有效的 JSON')
    }

    const models = parseModelListPayload(payload)
    if (!models.length) {
      throw new Error('未在响应中识别到模型列表，请确认接口返回结构')
    }

    return { models, fetchedAt: Date.now() }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (signal?.aborted) throw err
      throw new Error(`拉取模型超时（${MODEL_LIST_TIMEOUT_MS / 1000} 秒）`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}
