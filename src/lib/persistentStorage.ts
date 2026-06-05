export type PersistentStorageResult = {
  supported: boolean
  persisted: boolean
  quota?: number
  usage?: number
}

export async function requestPersistentStorage(): Promise<PersistentStorageResult> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { supported: false, persisted: false }
  }

  const storage = navigator.storage
  const estimate = await storage.estimate?.().catch(() => undefined)

  try {
    const alreadyPersisted = await storage.persisted?.()
    if (alreadyPersisted) {
      return {
        supported: true,
        persisted: true,
        quota: estimate?.quota,
        usage: estimate?.usage,
      }
    }

    // 请求浏览器把本地数据标记为持久存储，降低 IndexedDB 被自动清理的概率。
    const persisted = await storage.persist?.()
    return {
      supported: typeof persisted === 'boolean',
      persisted: Boolean(persisted),
      quota: estimate?.quota,
      usage: estimate?.usage,
    }
  } catch {
    return {
      supported: true,
      persisted: false,
      quota: estimate?.quota,
      usage: estimate?.usage,
    }
  }
}
