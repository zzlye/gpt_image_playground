import { useState } from 'react'
import { useStore } from '../store'
import { useTooltip } from '../hooks/useTooltip'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import { getActiveApiProfile } from '../lib/apiProfiles'
import { queryNewApiBalance } from '../lib/newApi'
import ViewportTooltip from './ViewportTooltip'
import HelpModal from './HelpModal'
import { HelpCircleIcon, SettingsIcon } from './icons'

export default function Header() {
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useStore((s) => s.showToast)
  const settings = useStore((s) => s.settings)
  const activeProfile = getActiveApiProfile(settings)
  const apiBalanceText = useStore((s) =>
    s.settings.apiBalanceProfileId === s.settings.activeProfileId ? s.settings.apiBalanceText : '',
  )
  const [isQueryingBalance, setIsQueryingBalance] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const helpTooltip = useTooltip()
  const settingsTooltip = useTooltip()

  const queryActiveProfileBalance = async () => {
    setIsQueryingBalance(true)
    try {
      const balance = await queryNewApiBalance(activeProfile)
      setSettings({
        apiBalanceText: balance.text,
        apiBalanceCurrency: balance.currency,
        apiBalanceUpdatedAt: balance.updatedAt,
        apiBalanceProfileId: activeProfile.id,
      })
      showToast('余额已更新', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '余额查询失败', 'error')
    } finally {
      setIsQueryingBalance(false)
    }
  }

  return (
    <>
      <header data-no-drag-select className="safe-area-top fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-white/[0.08] transition-transform duration-300 ease-in-out">
        <div className="safe-area-x safe-header-inner max-w-7xl mx-auto flex items-center justify-between relative">
          <div className="flex-1 min-w-0 pr-2 flex items-center gap-2">
            <h1 className="inline-flex items-start relative mr-2">
              <span className="text-[17px] sm:text-lg font-bold tracking-tight text-gray-800 dark:text-gray-100 transition-colors">
                文运工坊
              </span>
            </h1>
          </div>
          <div className="absolute left-1/2 top-1/2 hidden max-w-[48vw] -translate-x-1/2 -translate-y-1/2 sm:block">
            <div className="flex items-center gap-2 rounded-full border border-gray-200/70 bg-white/75 py-1 pl-3 pr-1 text-xs font-medium text-gray-600 shadow-sm backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-300">
              <span className="min-w-0 truncate">
                {activeProfile.name}：{apiBalanceText || '未查询'}
              </span>
              <button
                type="button"
                onClick={queryActiveProfileBalance}
                disabled={isQueryingBalance}
                className="shrink-0 rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isQueryingBalance ? '查询中' : '查询'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div
              className="relative"
              {...helpTooltip.handlers}
            >
              <button
                onClick={() => {
                  dismissAllTooltips()
                  setShowHelp(true)
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                aria-label="操作指南"
              >
                <HelpCircleIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={helpTooltip.visible} className="whitespace-nowrap">
                操作指南
              </ViewportTooltip>
            </div>
            <div
              className="relative"
              {...settingsTooltip.handlers}
            >
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                aria-label="设置"
              >
                <SettingsIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={settingsTooltip.visible} className="whitespace-nowrap">
                设置
              </ViewportTooltip>
            </div>
          </div>
        </div>
      </header>

      <div className="safe-area-top invisible pointer-events-none transition-all duration-300 ease-in-out max-h-[500px] opacity-100" aria-hidden="true">
        <div className="safe-header-inner" />
      </div>
      {showHelp && <HelpModal appMode="gallery" onClose={() => setShowHelp(false)} />}
    </>
  )
}
