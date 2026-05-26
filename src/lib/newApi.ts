import type { ApiProfile } from '../types'

export interface NewApiBalanceResult {
  text: string
  updatedAt: number
}

export interface NewApiNoticeResult {
  content: string
  updatedAt: number
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function getApiOrigin(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl)
  if (!normalized) return ''

  try {
    const url = new URL(normalized)
    return url.origin
  } catch {
    return normalized.replace(/\/v1$/i, '')
  }
}

function getApiRoot(baseUrl: string): string {
  return trimTrailingSlash(baseUrl).replace(/\/v1$/i, '')
}

async function fetchJson(url: string, apiKey?: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: apiKey?.trim()
      ? { Authorization: `Bearer ${apiKey.trim()}` }
      : undefined,
  })
  if (!response.ok) throw new Error(`请求失败：${response.status}`)
  return response.json()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function formatAmount(value: number): string {
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function parseSubscriptionBalance(subscription: unknown, usage: unknown): string | null {
  if (!isRecord(subscription)) return null
  const limit = readNumber(subscription, ['hard_limit_usd', 'system_hard_limit_usd', 'soft_limit_usd'])
  const usedCents = isRecord(usage) ? readNumber(usage, ['total_usage']) : null

  if (limit == null && usedCents == null) return null
  if (limit != null && usedCents != null) {
    const used = usedCents / 100
    return `可用 ${formatAmount(Math.max(0, limit - used))} / 总额 ${formatAmount(limit)}`
  }
  if (limit != null) return `总额 ${formatAmount(limit)}`
  return `已用 ${formatAmount((usedCents ?? 0) / 100)}`
}

function parseCreditGrantBalance(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const available = readNumber(payload, ['total_available', 'available'])
  const granted = readNumber(payload, ['total_granted', 'granted'])
  const used = readNumber(payload, ['total_used', 'used'])
  if (available != null && granted != null) return `可用 ${formatAmount(available)} / 总额 ${formatAmount(granted)}`
  if (available != null) return `可用 ${formatAmount(available)}`
  if (granted != null && used != null) return `可用 ${formatAmount(Math.max(0, granted - used))} / 总额 ${formatAmount(granted)}`
  return null
}

function parseUserBalance(payload: unknown): string | null {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
  if (!isRecord(data)) return null
  const quota = readNumber(data, ['quota', 'remain_quota'])
  const usedQuota = readNumber(data, ['used_quota'])
  if (quota != null && usedQuota != null) return `可用 ${formatAmount(quota)} / 已用 ${formatAmount(usedQuota)}`
  if (quota != null) return `可用 ${formatAmount(quota)}`
  return null
}

export async function queryNewApiBalance(profile: ApiProfile): Promise<NewApiBalanceResult> {
  const apiRoot = getApiRoot(profile.baseUrl)
  const origin = getApiOrigin(profile.baseUrl)
  if (!apiRoot || !origin) throw new Error('API URL 无效')
  if (!profile.apiKey.trim()) throw new Error('请先填写 API Key')

  const attempts: Array<() => Promise<string | null>> = [
    async () => {
      const [subscription, usage] = await Promise.all([
        fetchJson(`${apiRoot}/dashboard/billing/subscription`, profile.apiKey),
        fetchJson(`${apiRoot}/dashboard/billing/usage`, profile.apiKey),
      ])
      return parseSubscriptionBalance(subscription, usage)
    },
    async () => parseCreditGrantBalance(await fetchJson(`${apiRoot}/dashboard/billing/credit_grants`, profile.apiKey)),
    async () => parseUserBalance(await fetchJson(`${origin}/api/user/self`, profile.apiKey)),
  ]

  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const text = await attempt()
      if (text) return { text, updatedAt: Date.now() }
    } catch (err) {
      lastError = err
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : '余额查询失败')
}

function parseNoticePayload(payload: unknown): string {
  if (typeof payload === 'string') return payload.trim()
  const data = isRecord(payload) && 'data' in payload ? payload.data : payload
  if (typeof data === 'string') return data.trim()
  if (!isRecord(data)) return ''

  for (const key of ['notice', 'content', 'message', 'announcement', 'announcements']) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return ''
}

export async function fetchNewApiNotice(baseUrl: string): Promise<NewApiNoticeResult> {
  const origin = getApiOrigin(baseUrl)
  if (!origin) throw new Error('API URL 无效')
  const payload = await fetchJson(`${origin}/api/notice`)
  return {
    content: parseNoticePayload(payload),
    updatedAt: Date.now(),
  }
}
