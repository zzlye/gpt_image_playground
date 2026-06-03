import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { fileURLToPath, URL } from 'node:url'
import { normalizeDevProxyConfig } from './src/lib/devProxy'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

function loadDevProxyConfig() {
  try {
    return normalizeDevProxyConfig(
      JSON.parse(readFileSync('./dev-proxy.config.json', 'utf-8')) as unknown,
    )
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw error
  }
}

export default defineConfig(({ command }) => {
  const devProxyConfig = command === 'serve' ? loadDevProxyConfig() : null
  const publicProxy = {
    '/wy-public/wenyun': {
      target: 'https://zzlye.xyz:60',
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(/^\/wy-public\/wenyun/, ''),
    },
    '/wy-public/mukyu': {
      target: 'https://i.mukyu.ru',
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(/^\/wy-public\/mukyu/, ''),
    },
  }

  return {
    plugins: [react()],
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DEV_PROXY_CONFIG__: JSON.stringify(devProxyConfig),
      'process.env.NEXT_PUBLIC_APP_VERSION': JSON.stringify('v0.1.0'),
      'process.env.NEXT_PUBLIC_APP_RELEASES': JSON.stringify('[]'),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src/infiniteCanvasSource', import.meta.url)),
        'next/link': fileURLToPath(new URL('./src/infiniteCanvasCompat/NextLink.tsx', import.meta.url)),
        'next/navigation': fileURLToPath(new URL('./src/infiniteCanvasCompat/nextNavigation.tsx', import.meta.url)),
      },
    },
    server: {
      host: true,
      proxy: {
        ...publicProxy,
        ...(devProxyConfig?.enabled
          ? {
              [devProxyConfig.prefix]: {
                target: devProxyConfig.target,
                changeOrigin: devProxyConfig.changeOrigin,
                secure: devProxyConfig.secure,
                rewrite: (path) =>
                  path.replace(
                    new RegExp(`^${devProxyConfig.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
                    '',
                  ),
              },
            }
          : {}),
      },
    },
  }
})
