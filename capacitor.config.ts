import type { CapacitorConfig } from '@capacitor/cli'

/**
 * 手机 App 配置（Android / iOS）。
 * 打包流程：
 *   npm run build          # 产出 dist/
 *   npx cap sync android   # 同步到 android 工程
 *   cd android && ./gradlew assembleDebug
 */
const config: CapacitorConfig = {
  appId: 'io.github.xeycmd.word',
  appName: '背单词',
  // App 用相对路径构建（npm run build:app -> dist-app）
  webDir: 'dist-app',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f5f7fb',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#f5f7fb',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#4f7cff',
      showSpinner: false,
    },
  },
}

export default config
