import { useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ReceiptText, X } from 'lucide-react'
import type { ApiProfile } from '../types'
import { useStore } from '../store'
import { buildFixedModelPriceRows } from '../lib/modelPricing'

type PriceTableButtonProps = {
  activeProfile: ApiProfile
  buttonClassName?: string
  buttonStyle?: CSSProperties
}

export default function PriceTableButton({ activeProfile, buttonClassName, buttonStyle }: PriceTableButtonProps) {
  const settings = useStore((state) => state.settings)
  const [open, setOpen] = useState(false)
  const rows = useMemo(
    () => buildFixedModelPriceRows(activeProfile.id, [settings.textModel, settings.textVideoModel, settings.videoModel]),
    [activeProfile.id, settings.textModel, settings.textVideoModel, settings.videoModel],
  )

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className={buttonClassName || 'shrink-0 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-gray-600 transition hover:bg-white hover:text-gray-900 dark:bg-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.12]'}
          style={buttonStyle}
          onClick={() => setOpen(true)}
        >
          模型列表
        </button>
        <span className="shrink truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">
          获取联系微信：zzlye674
        </span>
      </div>

      {open ? createPortal(
        <div
          data-no-drag-select
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-overlay-in" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 p-5 dark:border-white/[0.08]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                  <ReceiptText className="h-4 w-4 text-blue-500" />
                  <span>{activeProfile.name || '当前站点'}模型列表</span>
                </div>
                <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">固定模型配置</div>
              </div>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-100"
                onClick={() => setOpen(false)}
                aria-label="关闭模型列表"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="overflow-hidden rounded-xl border border-gray-200/70 dark:border-white/[0.08]">
                <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-4 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-400 dark:bg-white/[0.04] dark:text-gray-500">
                  <span>模型</span>
                  <span>价格</span>
                </div>
                {rows.map((row) => (
                  <div key={`${row.model}-${row.upstreamModel || ''}`} className="grid grid-cols-[minmax(0,1fr)_120px] gap-4 border-t border-gray-100 px-4 py-3 text-sm dark:border-white/[0.06]">
                    <div className="min-w-0">
                      <div className="break-all font-medium text-gray-800 dark:text-gray-100">{row.model}</div>
                      {row.upstreamModel ? <div className="mt-1 break-all text-[11px] text-gray-400 dark:text-gray-500">实际模型：{row.upstreamModel}</div> : null}
                    </div>
                    <div className="font-mono text-gray-700 dark:text-gray-200">{row.priceText}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
