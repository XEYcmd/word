import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 三种构建：
//   npm run build          -> 常规多文件构建，用于 GitHub Pages / 自定义域名
//   npm run build:offline  -> 单文件离线版（词库内嵌、资源内联，file:// 可直接打开）
//   npm run build:app      -> 手机/桌面 App 用
export default defineConfig(({ mode }) => {
  const offline = mode === 'offline'
  const app = mode === 'app'

  // 全部使用相对路径：既能部署在 /word/ 子路径，也能直接部署在自定义域名根目录。
  // 应用使用 hash 路由，页面始终从 index.html 加载，相对路径是安全的。
  const base = './'

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
      watch: {
        // 构建产物不参与热更新监听，避免 dev 与 build 同时读写时 EBUSY
        ignored: ['**/dist/**', '**/dist-offline/**', '**/dist-app/**', '**/src-tauri/target/**'],
      },
    },
  }
})
