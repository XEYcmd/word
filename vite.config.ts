import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 两种构建：
//   npm run build          -> 常规多文件构建，用于 GitHub Pages
//   npm run build:offline  -> 单文件离线版（词库内嵌、资源内联）
export default defineConfig(({ mode }) => {
  const offline = mode === 'offline'

  return {
    // GitHub Pages 项目页路径为 /word/
    base: offline ? './' : '/word/',
    plugins: [react(), ...(offline ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    build: {
      outDir: offline ? 'dist-offline' : 'dist',
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
