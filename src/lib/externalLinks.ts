type ExternalLinkClickEvent = {
  preventDefault: () => void
  stopPropagation: () => void
}

const EXTERNAL_LINK_WINDOW_FEATURES = 'noopener,noreferrer'

export function openExternalLinkFromClick(event: ExternalLinkClickEvent, url: string) {
  event.preventDefault()
  event.stopPropagation()

  // 外链只在新窗口打开，避免当前页跳转导致正在生成的任务被浏览器中断。
  const openedWindow = globalThis.open?.(url, '_blank', EXTERNAL_LINK_WINDOW_FEATURES)
  if (openedWindow) openedWindow.opener = null
}
