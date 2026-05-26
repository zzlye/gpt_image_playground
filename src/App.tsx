import { useCallback, useEffect, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { LOCKED_WENYUN_BASE_URL, mergeImportedSettings } from './lib/apiProfiles'
import { getCustomProviderConfigUrl, loadCustomProviderSettingsFromUrl } from './lib/customProviderConfigUrl'
import { fetchNewApiNotice, type NewApiNoticeItem } from './lib/newApi'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import SupportPromptModal from './components/SupportPromptModal'
import AnnouncementModal from './components/AnnouncementModal'
import { useGlobalClickSuppression } from './lib/clickSuppression'

let customProviderConfigUrlImportStarted = false

function getAnnouncementHash(content: string) {
  let hash = 0
  for (let index = 0; index < content.length; index += 1) {
    hash = ((hash << 5) - hash + content.charCodeAt(index)) | 0
  }
  return String(hash)
}

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const settings = useStore((s) => s.settings)
  const appearanceBackgroundImageUrl = useStore((s) => s.settings.appearanceBackgroundImageUrl)
  const appearanceBackgroundOpacity = useStore((s) => s.settings.appearanceBackgroundOpacity)
  const appearanceBackgroundBlur = useStore((s) => s.settings.appearanceBackgroundBlur)
  const appearanceNightMode = useStore((s) => s.settings.appearanceNightMode)
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [announcementContent, setAnnouncementContent] = useState('')
  const [announcementPublishedAt, setAnnouncementPublishedAt] = useState<string | undefined>(undefined)
  const [announcementItems, setAnnouncementItems] = useState<NewApiNoticeItem[]>([])
  const [announcementLoading, setAnnouncementLoading] = useState(false)
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  const loadAnnouncement = useCallback(async (autoOpen = false) => {
    setAnnouncementLoading(true)
    try {
      const notice = await fetchNewApiNotice(LOCKED_WENYUN_BASE_URL)
      setAnnouncementContent(notice.content)
      setAnnouncementPublishedAt(notice.publishedAt)
      setAnnouncementItems(notice.items)

      if (autoOpen) {
        const latestSettings = useStore.getState().settings
        const today = new Date().toISOString().slice(0, 10)
        const noticeHash = getAnnouncementHash(notice.content)
        const dismissedToday = latestSettings.announcementDismissedDate === today && latestSettings.announcementDismissedHash === noticeHash
        const shouldAutoOpen = !latestSettings.announcementDismissedForever && !dismissedToday && Boolean(notice.content.trim())
        if (shouldAutoOpen) setAnnouncementOpen(true)
      }
    } catch (error) {
      console.warn('Failed to load announcement:', error)
      setAnnouncementContent('')
      setAnnouncementPublishedAt(undefined)
      setAnnouncementItems([])
    } finally {
      setAnnouncementLoading(false)
    }
  }, [])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    if (hasUrlSettingParams(searchParams)) {
      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    const customProviderConfigUrl = getCustomProviderConfigUrl()
    if (customProviderConfigUrl && !customProviderConfigUrlImportStarted) {
      customProviderConfigUrlImportStarted = true
      void loadCustomProviderSettingsFromUrl(customProviderConfigUrl)
        .then((importedSettings) => {
          if (!importedSettings) return
          const state = useStore.getState()
          state.setSettings(mergeImportedSettings(state.settings, importedSettings))
        })
        .catch((error) => {
          console.warn('Failed to import custom provider config URL:', error)
        })
    }

    initStore()
  }, [setSettings])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  useEffect(() => {
    void loadAnnouncement(true)
  }, [loadAnnouncement, settings.announcementDismissedDate, settings.announcementDismissedForever, settings.announcementDismissedHash])

  const dismissAnnouncementToday = () => {
    setSettings({
      announcementDismissedDate: new Date().toISOString().slice(0, 10),
      announcementDismissedHash: getAnnouncementHash(announcementContent),
    })
    setAnnouncementOpen(false)
  }

  const toggleAnnouncementForever = (checked: boolean) => {
    setSettings({
      announcementDismissedForever: checked,
      ...(checked ? { announcementDismissedDate: undefined, announcementDismissedHash: undefined } : {}),
    })
  }

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-white dark:bg-gray-950" />
      {appearanceBackgroundImageUrl.trim() && (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url("${appearanceBackgroundImageUrl.replace(/"/g, '\\"')}")`,
              opacity: appearanceBackgroundOpacity,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0"
            style={{
              backdropFilter: `blur(${appearanceBackgroundBlur}px)`,
              WebkitBackdropFilter: `blur(${appearanceBackgroundBlur}px)`,
            }}
          />
        </>
      )}
      <div className={`relative z-10 min-h-screen ${appearanceNightMode ? 'appearance-night' : ''}`}>
        <Header />
        <main data-home-main data-drag-select-surface className="pb-48">
          <div className="safe-area-x max-w-7xl mx-auto">
            <SearchBar />
            <TaskGrid />
          </div>
        </main>
        <InputBar />
        <DetailModal />
        <Lightbox />
        <SettingsModal />
        <ConfirmDialog />
        <SupportPromptModal />
        <Toast />
        <MaskEditorModal />
        <ImageContextMenu />
        <button
          type="button"
          onClick={() => {
            setAnnouncementOpen(true)
            void loadAnnouncement(false)
          }}
          className="fixed bottom-4 left-4 z-50 rounded-full border border-gray-200/70 bg-white/85 px-3 py-2 text-xs font-medium text-gray-700 shadow-lg backdrop-blur transition hover:bg-white hover:text-gray-900 dark:border-white/[0.08] dark:bg-gray-900/85 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          公告
        </button>
        {announcementOpen && (
          <AnnouncementModal
            content={announcementContent}
            dismissForever={settings.announcementDismissedForever}
            items={announcementItems}
            loading={announcementLoading}
            publishedAt={announcementPublishedAt}
            onClose={() => setAnnouncementOpen(false)}
            onDismissToday={dismissAnnouncementToday}
            onToggleDismissForever={toggleAnnouncementForever}
          />
        )}
      </div>
    </>
  )
}
