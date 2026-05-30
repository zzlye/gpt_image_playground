import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { LoaderCircle, ReceiptText, X } from 'lucide-react'
import type { ApiProfile } from '../types'
import {
  getFixedImageModelUnitCostText,
  getFixedImageRequestModel,
  getImageModelOptionsForProfile,
  LOCKED_PUBLIC_PROFILE_ID,
} from '../lib/apiProfiles'
import { queryNewApiPriceTable, type NewApiPriceTableItem } from '../lib/newApi'

type PriceTableButtonProps = {
  activeProfile: ApiProfile
  buttonClassName?: string
  buttonStyle?: CSSProperties
}

type PriceRow = {
  model: string
  upstreamModel?: string
  priceText: string
  source: 'NewAPI' | '固定'
}

export default function PriceTableButton({ activeProfile, buttonClassName, buttonStyle }: PriceTableButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [items, setItems] = useState<NewApiPriceTableItem[]>([])
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    void queryNewApiPriceTable(activeProfile)
      .then((result) => {
        if (cancelled) return
        setItems(result.items)
        setUpdatedAt(result.updatedAt)
        if (!result.found) setError('没有从 NewAPI 读取到价格表，已显示固定价格。')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '价格表读取失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeProfile.apiKey, activeProfile.baseUrl, activeProfile.id, open])

  const rows = useMemo(() => buildPriceRows(activeProfile.id, items), [activeProfile.id, items])

  return (
    <>
      <button
        type="button"
        className={buttonClassName || 'shrink-0 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-gray-600 transition hover:bg-white hover:text-gray-900 dark:bg-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.12]'}
        style={buttonStyle}
        onClick={() => setOpen(true)}
      >
        价格表
      </button>

      {open ? (
        <div
          data-no-drag-select
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-950/95 dark:ring-white/10">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200/70 px-5 py-4 dark:border-white/[0.08]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                  <ReceiptText className="h-4 w-4 text-blue-500" />
                  <span>{activeProfile.name || '当前站点'}价格表</span>
                </div>
                <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {updatedAt ? new Date(updatedAt).toLocaleString() : '正在读取 NewAPI 价格配置'}
                </div>
              </div>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-100"
                onClick={() => setOpen(false)}
                aria-label="关闭价格表"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
              {error ? (
                <div className="mb-3 rounded-xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                  {error}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-gray-200/70 dark:border-white/[0.08]">
                <div className="grid grid-cols-[minmax(0,1fr)_110px_64px] gap-3 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-400 dark:bg-white/[0.04] dark:text-gray-500">
                  <span>模型</span>
                  <span>价格</span>
                  <span>来源</span>
                </div>
                {rows.map((row) => (
                  <div key={`${row.model}-${row.upstreamModel || ''}`} className="grid grid-cols-[minmax(0,1fr)_110px_64px] gap-3 border-t border-gray-100 px-3 py-2.5 text-sm dark:border-white/[0.06]">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-800 dark:text-gray-100">{row.model}</div>
                      {row.upstreamModel ? <div className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-gray-500">实际模型：{row.upstreamModel}</div> : null}
                    </div>
                    <div className="font-mono text-gray-700 dark:text-gray-200">{row.priceText}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{row.source}</div>
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  <span>正在读取</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function buildPriceRows(profileId: string, fetchedItems: NewApiPriceTableItem[]): PriceRow[] {
  const fetchedByModel = new Map(fetchedItems.map((item) => [item.model.trim().toLowerCase(), item]))
  const fixedOptions = getImageModelOptionsForProfile(profileId)
  const knownModels = new Set<string>()

  const rows: PriceRow[] = fixedOptions.map((option) => {
    const model = String(option.value)
    const upstreamModel = getFixedImageRequestModel(model)
    knownModels.add(model.toLowerCase())
    knownModels.add(upstreamModel.toLowerCase())
    const fetched = fetchedByModel.get(upstreamModel.toLowerCase()) || fetchedByModel.get(model.toLowerCase())

    return {
      model,
      upstreamModel: upstreamModel !== model ? upstreamModel : undefined,
      priceText: fetched?.text || getFixedImageModelUnitCostText(model) || 'HUHN --',
      source: fetched ? 'NewAPI' : '固定',
    }
  })

  if (profileId === LOCKED_PUBLIC_PROFILE_ID) return rows

  for (const item of fetchedItems) {
    const key = item.model.trim().toLowerCase()
    if (!key || knownModels.has(key)) continue
    knownModels.add(key)
    rows.push({ model: item.model, priceText: item.text, source: 'NewAPI' })
  }

  return rows
}
