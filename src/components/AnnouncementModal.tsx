import { CloseIcon } from './icons'
import MarkdownRenderer from './MarkdownRenderer'

interface AnnouncementModalProps {
  content: string
  dismissForever: boolean
  loading?: boolean
  publishedAt?: string
  onClose: () => void
  onDismissToday: () => void
  onToggleDismissForever: (checked: boolean) => void
}

function formatAnnouncementDate(value: string | undefined) {
  if (!value?.trim()) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function AnnouncementModal({
  content,
  dismissForever,
  loading = false,
  publishedAt,
  onClose,
  onDismissToday,
  onToggleDismissForever,
}: AnnouncementModalProps) {
  const displayDate = formatAnnouncementDate(publishedAt)

  return (
    <div data-no-drag-select className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-overlay-in" onClick={onClose} />
      <div className="relative z-10 flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 p-5 dark:border-white/[0.08]">
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">公告</h3>
            {displayDate && (
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {displayDate}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭公告"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-[180px] flex-1 overflow-y-auto p-5 custom-scrollbar">
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">公告加载中...</div>
          ) : content.trim() ? (
            <MarkdownRenderer content={content} className="prose-sm max-w-none text-gray-700 dark:text-gray-200" />
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">暂无公告</div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-gray-100 p-4 dark:border-white/[0.08] sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => onToggleDismissForever(!dismissForever)}
            className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08] sm:min-w-44"
            role="switch"
            aria-checked={dismissForever}
          >
            <span>以后不再提醒</span>
            <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${dismissForever ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${dismissForever ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
            </span>
          </button>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onDismissToday}
              className="rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
            >
              今日不再提醒
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
