import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 三种构建：
//   npm run build          -> 常规多文件构建，用于 GitHub Pages（base=/word/）
//   npm run build:offline  -> 单文件离线版（词库内嵌、资源内联，file:// 可直接打开）
//   npm run build:app      -> 手机/桌面 App 用（base=./，资源相对路径）
export default defineConfig(({ mode }) => {
  const offline = mode === 'offline'
  const app = mode === 'app'

  // App 与离线版都用相对路径；只有 GitHub Pages 需要 /word/ 前缀
  const base = offline || app ? './' : '/word/'

  return {
    base,
    plugins: [react(), ...(offline ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    build: {
      outDir: offline ? 'dist-offline' : app ? 'dist-app' : 'dist',
      emptyOutDir: true,
      target: 'es2019',
      assetsInlineLimit: offline ? 100_000_000 : 4096,
      cssCodeSplit: !offline,
      chunkSizeWarningLimit: 4096,
      rollupOptions: offline
        ? {}
        : {
            output: {
              manualChunks: {
                words: ['./src/data/words.ts'],
              },
            },
          },
    },
    server: {
      port: 5178,
      host: '127.0.0.1',
    },
  }
})
