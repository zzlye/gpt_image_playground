import type { ApiProfile } from '../types'

export interface NewApiBalanceResult {
  text: string
  currency: string
  updatedAt: number
}

export interface NewApiNoticeResult {
  content: string
  updatedAt: number
}

export interface NewApiModelUnitCostResult {
  text: string
  updatedAt: number
}

interface NewApiStatusInfo {
  currencySymbol: string
  quotaPerUnit: number
  raw: unknown
}

const DEFAULT_CURRENCY_SYMBOL = '$'
const DEFAULT_QUOTA_PER_UNIT = 500_000
const FALLBACK_MODEL_UNIT_COST = `单次 ${DEFAULT_CURRENCY_SYMBOL}0.06`

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

async function fetchPublicJsonWithCorsFallback(url: string): Promise<unknown> {
  try {
    return await fetchJson(url)
  } catch (err) {
    const proxiedUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    try {
      return await fetchJson(proxiedUrl)
    } catch {
      throw err
    }
  }
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

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function getPayloadData(payload: unknown): unknown {
  return isRecord(payload) && 'data' in payload ? payload.data : payload
}

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findValueByNormalizedKeys(input: unknown, keys: string[], depth = 0): unknown {
  if (depth > 5 || !input || typeof input !== 'object') return undefined
  const normalizedKeys = new Set(keys.map(normalizeLookupKey))

  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findValueByNormalizedKeys(item, keys, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (normalizedKeys.has(normalizeLookupKey(key))) return value
  }

  for (const value of Object.values(input as Record<string, unknown>)) {
    const found = findValueByNormalizedKeys(value, keys, depth + 1)
    if (found !== undefined) return found
  }

  return undefined
}

function parseJsonLike(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

function formatAmount(value: number): string {
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function formatCurrency(value: number, currencySymbol: string): string {
  const amount = formatAmount(value)
  return /^[A-Za-z]{2,}$/.test(currencySymbol) ? `${currencySymbol} ${amount}` : `${currencySymbol}${amount}`
}

function getCurrencySymbolFromCode(code: string | null): string {
  const normalized = code?.trim().toUpperCase()
  if (!normalized) return DEFAULT_CURRENCY_SYMBOL
  if (normalized === 'USD') return '$'
  if (normalized === 'CNY' || normalized === 'RMB' || normalized === 'CNH') return '¥'
  if (normalized === 'EUR') return '€'
  if (normalized === 'GBP') return '£'
  if (normalized === 'JPY') return '¥'
  return code?.trim() || DEFAULT_CURRENCY_SYMBOL
}

function parseNewApiStatus(payload: unknown): NewApiStatusInfo {
  const data = getPayloadData(payload)
  const currencyValue = findValueByNormalizedKeys(data, [
    'custom_currency_symbol',
    'customCurrencySymbol',
    'CustomCurrencySymbol',
    'currency_symbol',
    'currencySymbol',
    'display_currency_symbol',
    'DisplayCurrencySymbol',
    'currency',
    'display_currency',
    'DisplayCurrency',
  ])
  const currencyText = typeof currencyValue === 'string' ? currencyValue.trim() : ''
  const quotaPerUnitValue = findValueByNormalizedKeys(data, ['quota_per_unit', 'QuotaPerUnit'])
  const quotaPerUnit = typeof quotaPerUnitValue === 'number'
    ? quotaPerUnitValue
    : Number(quotaPerUnitValue)
  const currencySymbol = currencyText.length <= 8 && currencyText
    ? getCurrencySymbolFromCode(currencyText)
    : DEFAULT_CURRENCY_SYMBOL

  return {
    currencySymbol,
    quotaPerUnit: Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : DEFAULT_QUOTA_PER_UNIT,
    raw: data,
  }
}

async function fetchNewApiStatus(apiRoot: string, origin: string): Promise<NewApiStatusInfo> {
  const attempts = [`${origin}/api/status`, `${apiRoot}/api/status`, `${origin}/status`]
  let lastError: unknown = null
  for (const url of attempts) {
    try {
      return parseNewApiStatus(await fetchJson(url))
    } catch (err) {
      lastError = err
    }
  }
  if (lastError) console.warn('Failed to load NewAPI status:', lastError)
  return {
    currencySymbol: DEFAULT_CURRENCY_SYMBOL,
    quotaPerUnit: DEFAULT_QUOTA_PER_UNIT,
    raw: null,
  }
}

function quotaToCurrency(value: number, status: NewApiStatusInfo): number {
  return value / status.quotaPerUnit
}

function formatQuotaCurrency(value: number, status: NewApiStatusInfo): string {
  return formatCurrency(quotaToCurrency(value, status), status.currencySymbol)
}

function parseSubscriptionBalance(subscription: unknown, usage: unknown, status: NewApiStatusInfo): string | null {
  if (!isRecord(subscription)) return null
  const limit = readNumber(subscription, ['hard_limit_usd', 'system_hard_limit_usd', 'soft_limit_usd'])
  const usedCents = isRecord(usage) ? readNumber(usage, ['total_usage']) : null

  if (limit == null && usedCents == null) return null
  if (limit != null && usedCents != null) {
    const used = usedCents / 100
    return `可用 ${formatCurrency(Math.max(0, limit - used), status.currencySymbol)} / 总额 ${formatCurrency(limit, status.currencySymbol)}`
  }
  if (limit != null) return `总额 ${formatCurrency(limit, status.currencySymbol)}`
  return `已用 ${formatCurrency((usedCents ?? 0) / 100, status.currencySymbol)}`
}

function parseCreditGrantBalance(payload: unknown, status: NewApiStatusInfo): string | null {
  if (!isRecord(payload)) return null
  const available = readNumber(payload, ['total_available', 'available'])
  const granted = readNumber(payload, ['total_granted', 'granted'])
  const used = readNumber(payload, ['total_used', 'used'])
  if (available != null && granted != null) return `可用 ${formatCurrency(available, status.currencySymbol)} / 总额 ${formatCurrency(granted, status.currencySymbol)}`
  if (available != null) return `可用 ${formatCurrency(available, status.currencySymbol)}`
  if (granted != null && used != null) return `可用 ${formatCurrency(Math.max(0, granted - used), status.currencySymbol)} / 总额 ${formatCurrency(granted, status.currencySymbol)}`
  return null
}

function parseUserBalance(payload: unknown, status: NewApiStatusInfo): string | null {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
  if (!isRecord(data)) return null
  const quota = readNumber(data, ['quota', 'remain_quota', 'remainQuota', 'balance'])
  const usedQuota = readNumber(data, ['used_quota'])
  if (quota != null && usedQuota != null) return `可用 ${formatQuotaCurrency(quota, status)} / 已用 ${formatQuotaCurrency(usedQuota, status)}`
  if (quota != null) return `可用 ${formatQuotaCurrency(quota, status)}`
  return null
}

export async function queryNewApiBalance(profile: ApiProfile): Promise<NewApiBalanceResult> {
  const apiRoot = getApiRoot(profile.baseUrl)
  const origin = getApiOrigin(profile.baseUrl)
  if (!apiRoot || !origin) throw new Error('API URL 无效')
  if (!profile.apiKey.trim()) throw new Error('请先填写 API Key')
  const status = await fetchNewApiStatus(apiRoot, origin)

  const attempts: Array<() => Promise<string | null>> = [
    async () => {
      const [subscription, usage] = await Promise.all([
        fetchJson(`${apiRoot}/dashboard/billing/subscription`, profile.apiKey),
        fetchJson(`${apiRoot}/dashboard/billing/usage`, profile.apiKey),
      ])
      return parseSubscriptionBalance(subscription, usage, status)
    },
    async () => parseCreditGrantBalance(await fetchJson(`${apiRoot}/dashboard/billing/credit_grants`, profile.apiKey), status),
    async () => parseUserBalance(await fetchJson(`${origin}/api/user/self`, profile.apiKey), status),
  ]

  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const text = await attempt()
      if (text) return { text, currency: status.currencySymbol, updatedAt: Date.now() }
    } catch (err) {
      lastError = err
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : '余额查询失败')
}

function getNoticeItemText(input: unknown): string {
  if (typeof input === 'string') return input.trim()
  if (!isRecord(input)) return ''
  const title = readString(input, ['title', 'name', 'subject']) ?? ''
  const content = readString(input, ['content', 'message', 'text', 'description', 'body']) ?? ''
  const createdAt = readString(input, ['created_at', 'createdAt', 'time', 'date']) ?? ''
  const parts = [
    title ? `### ${title}` : '',
    createdAt ? `_${createdAt}_` : '',
    content,
  ].filter(Boolean)
  return parts.join('\n\n').trim()
}

function parseNoticePayload(payload: unknown): string {
  if (typeof payload === 'string') return payload.trim()
  const data = isRecord(payload) && 'data' in payload ? payload.data : payload
  if (Array.isArray(data)) {
    return data.map(getNoticeItemText).filter(Boolean).join('\n\n---\n\n')
  }
  if (typeof data === 'string') return data.trim()
  if (!isRecord(data)) return ''

  for (const key of ['notices', 'notice', 'content', 'message', 'announcement', 'announcements', 'items', 'list']) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (Array.isArray(value)) return value.map(getNoticeItemText).filter(Boolean).join('\n\n---\n\n')
    if (isRecord(value)) {
      const nested = parseNoticePayload(value)
      if (nested) return nested
    }
  }

  return getNoticeItemText(data)
}

export async function fetchNewApiNotice(baseUrl: string): Promise<NewApiNoticeResult> {
  const origin = getApiOrigin(baseUrl)
  if (!origin) throw new Error('API URL 无效')
  const attempts = [`${origin}/api/notice`, `${origin}/api/status`, `${origin}/api/announcements`, `${origin}/api/system/notice`]
  let lastError: unknown = null
  let hasSuccessfulResponse = false
  for (const url of attempts) {
    try {
      hasSuccessfulResponse = true
      const content = parseNoticePayload(await fetchPublicJsonWithCorsFallback(url))
      if (content) return { content, updatedAt: Date.now() }
    } catch (err) {
      lastError = err
    }
  }
  if (lastError && !hasSuccessfulResponse) throw new Error(lastError instanceof Error ? lastError.message : '公告加载失败')
  return {
    content: '',
    updatedAt: Date.now(),
  }
}

function findModelPricePayload(input: unknown, depth = 0): unknown {
  if (depth > 5 || !input || typeof input !== 'object') return undefined

  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findModelPricePayload(item, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalized = normalizeLookupKey(key)
    if (normalized === 'modelprice' || normalized === 'modelprices') return parseJsonLike(value)
  }

  for (const value of Object.values(input as Record<string, unknown>)) {
    const found = findModelPricePayload(parseJsonLike(value), depth + 1)
    if (found !== undefined) return found
  }

  return undefined
}

function readModelPriceValue(input: unknown, model: string): number | null {
  const payload = parseJsonLike(input)
  const modelKey = model.trim().toLowerCase()
  if (!modelKey) return null

  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (!isRecord(item)) continue
      const itemModel = readString(item, ['model', 'model_name', 'name', 'id'])?.toLowerCase()
      if (itemModel !== modelKey) continue
      const price = readNumber(item, ['model_price', 'modelPrice', 'price', 'cost', 'quota', 'value'])
      if (price != null) return price
    }
    return null
  }

  if (!isRecord(payload)) return null
  for (const [key, value] of Object.entries(payload)) {
    if (key.toLowerCase() !== modelKey) continue
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) return numeric
    }
    if (isRecord(value)) {
      const price = readNumber(value, ['model_price', 'modelPrice', 'price', 'cost', 'quota', 'value'])
      if (price != null) return price
    }
  }

  return null
}

function formatModelUnitCost(value: number, status: NewApiStatusInfo): string {
  const amount = value > 1000 ? quotaToCurrency(value, status) : value
  return `单次 ${formatCurrency(amount, status.currencySymbol)}`
}

export async function queryNewApiModelUnitCost(profile: ApiProfile): Promise<NewApiModelUnitCostResult> {
  const apiRoot = getApiRoot(profile.baseUrl)
  const origin = getApiOrigin(profile.baseUrl)
  if (!apiRoot || !origin) return { text: FALLBACK_MODEL_UNIT_COST, updatedAt: Date.now() }

  try {
    const status = await fetchNewApiStatus(apiRoot, origin)
    const pricePayloads: unknown[] = [status.raw]
    const priceAttempts = [
      `${origin}/api/ratio_config`,
      `${apiRoot}/api/ratio_config`,
      `${origin}/api/pricing`,
      `${apiRoot}/api/pricing`,
    ]

    for (const url of priceAttempts) {
      try {
        pricePayloads.push(await fetchJson(url, profile.apiKey))
      } catch {
        // 单个公开定价接口失败不影响兜底展示。
      }
    }

    const price = pricePayloads
      .map((payload) =>
        readModelPriceValue(findModelPricePayload(payload), profile.model)
          ?? readModelPriceValue(getPayloadData(payload), profile.model),
      )
      .find((value): value is number => value != null)

    return {
      text: price == null ? FALLBACK_MODEL_UNIT_COST : formatModelUnitCost(price, status),
      updatedAt: Date.now(),
    }
  } catch {
    return { text: FALLBACK_MODEL_UNIT_COST, updatedAt: Date.now() }
  }
}
