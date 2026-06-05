import type { CloudSyncProvider, CloudSyncSettings } from '../types'
import { createDataExportFile, getFullDataExportOptions, importData, useStore, type ExportOptions } from '../store'
import { ensureZipFileName, isLocalFileSyncSupported, readLocalSyncFile, writeLocalSyncFile } from './localFileSync'

export type CloudSyncProviderInfo = {
  value: CloudSyncProvider
  label: string
  protocol: 'local-file' | 'webdav' | 'google-drive' | 'onedrive' | 'dropbox' | 'custom-api' | 'bridge'
  direct: boolean
  help: string
  docsUrl?: string
}

export const CLOUD_SYNC_PROVIDER_OPTIONS: CloudSyncProviderInfo[] = [
  { value: 'local-file', label: '本地硬盘文件', protocol: 'local-file', direct: true, help: '选择电脑上的一个备份 zip 文件，之后手动同步和自动同步都会直接写入这个文件。' },
  { value: 'webdav', label: 'WebDAV 通用', protocol: 'webdav', direct: true, help: '适合自建盘和支持 WebDAV 的网盘。', docsUrl: 'https://datatracker.ietf.org/doc/html/rfc4918' },
  { value: 'nextcloud', label: 'Nextcloud / ownCloud', protocol: 'webdav', direct: true, help: '填写 Nextcloud/ownCloud 的 WebDAV 地址和应用密码。' },
  { value: 'jianguoyun', label: '坚果云', protocol: 'webdav', direct: true, help: '坚果云使用 WebDAV 地址、账号和应用密码同步。' },
  { value: 'synology', label: '群晖 Synology', protocol: 'webdav', direct: true, help: '群晖 WebDAV Server 开启后填写 WebDAV 根地址。' },
  { value: 'alist', label: 'AList / OpenList', protocol: 'webdav', direct: true, help: 'AList/OpenList 可以把百度、夸克、阿里云盘等转成 WebDAV。' },
  { value: 'cloudreve', label: 'Cloudreve', protocol: 'webdav', direct: true, help: 'Cloudreve 开启 WebDAV 后可直接同步。' },
  { value: 'koofr', label: 'Koofr', protocol: 'webdav', direct: true, help: 'Koofr 支持 WebDAV，用应用密码连接。' },
  { value: 'yandex-disk', label: 'Yandex Disk', protocol: 'webdav', direct: true, help: 'Yandex Disk 支持 WebDAV，用应用密码连接。' },
  { value: 'google-drive', label: 'Google Drive', protocol: 'google-drive', direct: true, help: '需要 OAuth access token，可选填写目标文件夹 ID。', docsUrl: 'https://developers.google.com/workspace/drive/api/guides/manage-uploads' },
  { value: 'onedrive', label: 'OneDrive', protocol: 'onedrive', direct: true, help: '需要 Microsoft Graph OAuth access token。', docsUrl: 'https://learn.microsoft.com/en-us/graph/api/driveitem-put-content' },
  { value: 'dropbox', label: 'Dropbox', protocol: 'dropbox', direct: true, help: '需要 Dropbox OAuth access token。', docsUrl: 'https://www.dropbox.com/developers/documentation/http/documentation#files-upload' },
  { value: 'custom-api', label: '自定义同步接口', protocol: 'custom-api', direct: true, help: '用于自己写后端桥接百度、夸克、Google OAuth 等。' },
  { value: 'baidu-netdisk', label: '百度网盘（桥接）', protocol: 'bridge', direct: false, help: '浏览器直连受开放平台授权和 CORS 限制，建议用 AList/WebDAV 或自定义同步接口。' },
  { value: 'quark-drive', label: '夸克网盘（桥接）', protocol: 'bridge', direct: false, help: '未提供稳定公开浏览器上传接口，建议用 AList/WebDAV 或自定义同步接口。' },
  { value: 'aliyundrive', label: '阿里云盘（桥接）', protocol: 'bridge', direct: false, help: '建议用 AList/WebDAV 或自定义同步接口桥接 OAuth。' },
  { value: 'box', label: 'Box（桥接）', protocol: 'bridge', direct: false, help: 'Box 官方上传需要 OAuth 和文件夹/文件 ID，建议后端桥接。' },
  { value: 'pcloud', label: 'pCloud（桥接）', protocol: 'bridge', direct: false, help: '建议通过 WebDAV/自定义接口接入。' },
]

const WEB_DAV_PROVIDERS = new Set<CloudSyncProvider>(['webdav', 'nextcloud', 'jianguoyun', 'synology', 'alist', 'cloudreve', 'koofr', 'yandex-disk'])

export function getCloudSyncProviderInfo(provider: CloudSyncProvider) {
  return CLOUD_SYNC_PROVIDER_OPTIONS.find((item) => item.value === provider) ?? CLOUD_SYNC_PROVIDER_OPTIONS[0]
}

export function isCloudSyncReady(settings: CloudSyncSettings) {
  const info = getCloudSyncProviderInfo(settings.provider)
  if (!settings.enabled || !info.direct) return false
  if (settings.provider === 'local-file') return isLocalFileSyncSupported() && Boolean(settings.localFileName?.trim())
  if (WEB_DAV_PROVIDERS.has(settings.provider)) return Boolean(settings.endpoint.trim() && settings.username.trim() && settings.password)
  if (settings.provider === 'google-drive' || settings.provider === 'onedrive' || settings.provider === 'dropbox') return Boolean(settings.token.trim())
  if (settings.provider === 'custom-api') return Boolean(settings.endpoint.trim())
  return false
}

export function hasCloudSyncUploadScope(settings: CloudSyncSettings) {
  return settings.uploadTasks || settings.uploadCanvasProjects || settings.uploadAssets
}

export function hasCloudSyncPullScope(settings: CloudSyncSettings) {
  return settings.pullTasks || settings.pullCanvasProjects || settings.pullAssets
}

function getCloudSyncExportOptions(settings: CloudSyncSettings): ExportOptions {
  const fullOptions = getFullDataExportOptions()
  return {
    exportTasks: settings.uploadTasks,
    exportCanvasProjectIds: settings.uploadCanvasProjects ? fullOptions.exportCanvasProjectIds : [],
    exportAssetIds: settings.uploadAssets ? fullOptions.exportAssetIds : [],
  }
}

function getAuthHeaders(settings: CloudSyncSettings): Record<string, string> {
  if (settings.token.trim()) return { Authorization: `Bearer ${settings.token.trim()}` }
  if (!settings.username.trim()) return {}

  const value = `${settings.username}:${settings.password}`
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return { Authorization: `Basic ${btoa(binary)}` }
}

function assertOk(response: Response, action: string) {
  if (response.ok) return
  throw new Error(`${action}失败：HTTP ${response.status}`)
}

function normalizeRemotePath(path: string) {
  const trimmed = path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}` : ''
}

function getRemoteFilePath(settings: CloudSyncSettings) {
  return `${normalizeRemotePath(settings.remotePath)}/${ensureZipFileName(settings.fileName)}`.replace(/\/+/g, '/')
}

function appendPathToUrl(baseUrl: string, remotePath: string) {
  const url = new URL(baseUrl)
  const base = url.pathname.replace(/\/+$/g, '')
  const suffix = remotePath.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  url.pathname = `${base}/${suffix}`
  return url.toString()
}

async function ensureWebDavFolders(settings: CloudSyncSettings) {
  const folders = normalizeRemotePath(settings.remotePath).split('/').filter(Boolean)
  let current = ''
  for (const folder of folders) {
    current += `/${folder}`
    const response = await fetch(appendPathToUrl(settings.endpoint, current), {
      method: 'MKCOL',
      headers: getAuthHeaders(settings),
    })
    // 201 创建成功，405 已存在，409 父目录缺失。409 后续 PUT 会给出更明确错误。
    if (![201, 405, 409].includes(response.status) && !response.ok) {
      throw new Error(`创建远端目录失败：HTTP ${response.status}`)
    }
  }
}

async function uploadWebDav(settings: CloudSyncSettings, blob: Blob) {
  await ensureWebDavFolders(settings)
  const response = await fetch(appendPathToUrl(settings.endpoint, getRemoteFilePath(settings)), {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(settings),
      'Content-Type': 'application/zip',
    },
    body: blob,
  })
  assertOk(response, 'WebDAV 上传')
}

async function downloadWebDav(settings: CloudSyncSettings) {
  const response = await fetch(appendPathToUrl(settings.endpoint, getRemoteFilePath(settings)), {
    method: 'GET',
    headers: getAuthHeaders(settings),
  })
  assertOk(response, 'WebDAV 拉取')
  return response.blob()
}

function googleDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findGoogleDriveFile(settings: CloudSyncSettings) {
  const queryParts = [`name='${googleDriveQueryValue(ensureZipFileName(settings.fileName))}'`, 'trashed=false']
  if (settings.folderId.trim()) queryParts.push(`'${googleDriveQueryValue(settings.folderId.trim())}' in parents`)
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', queryParts.join(' and '))
  url.searchParams.set('pageSize', '1')
  url.searchParams.set('orderBy', 'modifiedTime desc')
  url.searchParams.set('fields', 'files(id,name,modifiedTime)')
  const response = await fetch(url.toString(), { headers: getAuthHeaders(settings) })
  assertOk(response, 'Google Drive 查询')
  const data = await response.json() as { files?: Array<{ id: string }> }
  return data.files?.[0]?.id ?? null
}

async function uploadGoogleDrive(settings: CloudSyncSettings, blob: Blob) {
  const fileId = await findGoogleDriveFile(settings)
  if (fileId) {
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(settings),
        'Content-Type': 'application/zip',
      },
      body: blob,
    })
    assertOk(response, 'Google Drive 更新')
    return
  }

  const boundary = `sync-${Date.now().toString(36)}`
  const metadata = {
    name: ensureZipFileName(settings.fileName),
    mimeType: 'application/zip',
    ...(settings.folderId.trim() ? { parents: [settings.folderId.trim()] } : {}),
  }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` })
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: getAuthHeaders(settings),
    body,
  })
  assertOk(response, 'Google Drive 上传')
}

async function downloadGoogleDrive(settings: CloudSyncSettings) {
  const fileId = await findGoogleDriveFile(settings)
  if (!fileId) throw new Error('Google Drive 中没有找到同步备份文件')
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: getAuthHeaders(settings),
  })
  assertOk(response, 'Google Drive 拉取')
  return response.blob()
}

function encodePathSegments(path: string) {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

async function uploadOneDrive(settings: CloudSyncSettings, blob: Blob) {
  const path = encodePathSegments(getRemoteFilePath(settings))
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(settings),
      'Content-Type': 'application/zip',
    },
    body: blob,
  })
  assertOk(response, 'OneDrive 上传')
}

async function downloadOneDrive(settings: CloudSyncSettings) {
  const path = encodePathSegments(getRemoteFilePath(settings))
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
    headers: getAuthHeaders(settings),
  })
  assertOk(response, 'OneDrive 拉取')
  return response.blob()
}

async function uploadDropbox(settings: CloudSyncSettings, blob: Blob) {
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      ...getAuthHeaders(settings),
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: getRemoteFilePath(settings),
        mode: 'overwrite',
        autorename: false,
        mute: true,
      }),
    },
    body: blob,
  })
  assertOk(response, 'Dropbox 上传')
}

async function downloadDropbox(settings: CloudSyncSettings) {
  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      ...getAuthHeaders(settings),
      'Dropbox-API-Arg': JSON.stringify({ path: getRemoteFilePath(settings) }),
    },
  })
  assertOk(response, 'Dropbox 拉取')
  return response.blob()
}

async function uploadCustomApi(settings: CloudSyncSettings, blob: Blob) {
  const formData = new FormData()
  formData.append('file', blob, ensureZipFileName(settings.fileName))
  formData.append('fileName', ensureZipFileName(settings.fileName))
  formData.append('remotePath', normalizeRemotePath(settings.remotePath))
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: getAuthHeaders(settings),
    body: formData,
  })
  assertOk(response, '自定义接口上传')
}

async function downloadCustomApi(settings: CloudSyncSettings) {
  const url = new URL(settings.endpoint)
  url.searchParams.set('fileName', ensureZipFileName(settings.fileName))
  url.searchParams.set('remotePath', normalizeRemotePath(settings.remotePath))
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getAuthHeaders(settings),
  })
  assertOk(response, '自定义接口拉取')
  return response.blob()
}

async function uploadBlob(settings: CloudSyncSettings, blob: Blob, options: { auto?: boolean } = {}) {
  if (settings.provider === 'local-file') return writeLocalSyncFile(blob, settings.fileName, { allowPrompt: !options.auto })
  if (WEB_DAV_PROVIDERS.has(settings.provider)) return uploadWebDav(settings, blob)
  if (settings.provider === 'google-drive') return uploadGoogleDrive(settings, blob)
  if (settings.provider === 'onedrive') return uploadOneDrive(settings, blob)
  if (settings.provider === 'dropbox') return uploadDropbox(settings, blob)
  if (settings.provider === 'custom-api') return uploadCustomApi(settings, blob)
  throw new Error(`${getCloudSyncProviderInfo(settings.provider).label} 需要先通过 WebDAV 或自定义接口桥接`)
}

async function downloadBlob(settings: CloudSyncSettings) {
  if (settings.provider === 'local-file') return readLocalSyncFile({ allowPrompt: true })
  if (WEB_DAV_PROVIDERS.has(settings.provider)) return downloadWebDav(settings)
  if (settings.provider === 'google-drive') return downloadGoogleDrive(settings)
  if (settings.provider === 'onedrive') return downloadOneDrive(settings)
  if (settings.provider === 'dropbox') return downloadDropbox(settings)
  if (settings.provider === 'custom-api') return downloadCustomApi(settings)
  throw new Error(`${getCloudSyncProviderInfo(settings.provider).label} 需要先通过 WebDAV 或自定义接口桥接`)
}

export async function uploadDataBackupToCloud(settings: CloudSyncSettings, options: { silent?: boolean, auto?: boolean } = {}) {
  if (!isCloudSyncReady(settings)) throw new Error('请先完整填写可用的同步配置')
  if (!hasCloudSyncUploadScope(settings)) throw new Error('请至少勾选一个上传同步范围')
  const exportFile = await createDataExportFile(getCloudSyncExportOptions(settings))
  const localFile = await uploadBlob(settings, exportFile.blob, { auto: options.auto })
  const cloudSync = {
    ...settings,
    ...(settings.provider === 'local-file' && localFile?.name ? { localFileName: localFile.name } : {}),
    lastUploadAt: Date.now(),
    lastAutoSyncAt: options.auto ? Date.now() : settings.lastAutoSyncAt,
    lastError: undefined,
  }
  useStore.getState().setSettings({ cloudSync })
  if (!options.silent) useStore.getState().showToast(settings.provider === 'local-file' ? '已写入本地备份文件' : '已上传数据备份到网盘', 'success')
}

export async function pullDataBackupFromCloud(settings: CloudSyncSettings) {
  if (!isCloudSyncReady(settings)) throw new Error('请先完整填写可用的同步配置')
  if (!hasCloudSyncPullScope(settings)) throw new Error('请至少勾选一个拉取导入范围')
  const blob = await downloadBlob(settings)
  const file = blob instanceof File ? blob : new File([blob], ensureZipFileName(settings.fileName), { type: 'application/zip' })
  const imported = await importData(file, {
    importConfig: false,
    importTasks: settings.pullTasks,
    importCanvasProjects: settings.pullCanvasProjects,
    importAssets: settings.pullAssets,
  })
  if (!imported) return
  useStore.getState().setSettings({
    cloudSync: {
      ...settings,
      ...(settings.provider === 'local-file' ? { localFileName: file.name } : {}),
      lastPullAt: Date.now(),
      lastError: undefined,
    },
  })
}
