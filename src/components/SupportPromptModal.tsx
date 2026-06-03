import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon } from './icons'

export default function SupportPromptModal() {
  const supportPromptOpen = useStore((s) => s.supportPromptOpen)
  const dismissSupportPrompt = useStore((s) => s.dismissSupportPrompt)
  const confirmDialog = useStore((s) => s.confirmDialog)
  const detailTaskId = useStore((s) => s.detailTaskId)
  const lightboxImageId = useStore((s) => s.lightboxImageId)
  const showSettings = useStore((s) => s.showSettings)
  const maskEditorImageId = useStore((s) => s.maskEditorImageId)

  const blockedByHigherPriorityModal = Boolean(
    confirmDialog || detailTaskId || lightboxImageId || showSettings || maskEditorImageId,
  )
  const visible = supportPromptOpen && !blockedByHigherPriorityModal

  useCloseOnEscape(visible, dismissSupportPrompt)
  usePreventBackgroundScroll(visible)

  if (!visible) return null

  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={dismissSupportPrompt}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div
        className="relative z-10 flex w-full max-w-sm flex-col rounded-[2rem] border border-white/50 bg-white/95 p-6 pb-7 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute right-4 top-4">
          <button
            type="button"
            onClick={dismissSupportPrompt}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 mt-6 flex justify-center">
          <img
            src="/support-qr.jpg"
            alt="联系二维码"
            className="h-52 w-52 rounded-2xl border border-gray-100 bg-white object-contain p-2 shadow-sm dark:border-white/[0.08]"
          />
        </div>

        <p className="px-2 text-center text-[15px] font-medium leading-relaxed text-gray-700 dark:text-gray-200">
          你已经成功生成了超过20张图片!<br />
          需要更多生图模型欢迎联系：zzlye674
        </p>
      </div>
    </div>,
    document.body,
  )
}
