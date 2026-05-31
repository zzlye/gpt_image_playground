import { useEffect, useRef } from 'react'
import { hasCloudSyncUploadScope, isCloudSyncReady, uploadDataBackupToCloud } from '../lib/cloudSync'
import { useStore } from '../store'

export default function DataSyncManager() {
  const cloudSync = useStore((state) => state.settings.cloudSync)
  const runningRef = useRef(false)

  useEffect(() => {
    if (!cloudSync.enabled || !cloudSync.autoSync) return

    const intervalMs = Math.max(5, cloudSync.autoSyncIntervalMinutes) * 60 * 1000
    const runAutoSync = async () => {
      const latest = useStore.getState().settings.cloudSync
      if (runningRef.current || !latest.enabled || !latest.autoSync || !isCloudSyncReady(latest) || !hasCloudSyncUploadScope(latest)) return

      const lastUploadAt = latest.lastUploadAt ?? 0
      if (Date.now() - lastUploadAt < intervalMs) return

      runningRef.current = true
      try {
        await uploadDataBackupToCloud(latest, { silent: true, auto: true })
      } catch (error) {
        // 自动同步失败只记录状态，不弹 toast，避免后台定时任务反复打扰用户。
        useStore.getState().setSettings({
          cloudSync: {
            ...latest,
            lastAutoSyncAt: Date.now(),
            lastError: error instanceof Error ? error.message : String(error),
          },
        })
      } finally {
        runningRef.current = false
      }
    }

    void runAutoSync()
    const timer = window.setInterval(() => void runAutoSync(), 30 * 1000)
    return () => window.clearInterval(timer)
  }, [
    cloudSync.autoSync,
    cloudSync.autoSyncIntervalMinutes,
    cloudSync.enabled,
    cloudSync.endpoint,
    cloudSync.fileName,
    cloudSync.folderId,
    cloudSync.password,
    cloudSync.provider,
    cloudSync.uploadAssets,
    cloudSync.uploadCanvasProjects,
    cloudSync.uploadTasks,
    cloudSync.remotePath,
    cloudSync.token,
    cloudSync.username,
  ])

  return null
}
