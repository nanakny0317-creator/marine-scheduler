import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

const external = ['sql.js', 'fs', 'path', 'electron']

// ELECTRON_MODE=browser のとき Electron プラグインをスキップ（Dev Container / UI 開発用）
const isElectronMode = process.env.ELECTRON_MODE !== 'browser'

export default defineConfig({
  server: {
    host: true, // コンテナ外からのポートフォワードを許可
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
  plugins: [
    react(),
    ...(isElectronMode
      ? [
          electron([
            {
              entry: 'electron/main.ts',
              onstart(options) {
                options.startup()
              },
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: { external },
                },
              },
            },
            {
              entry: 'electron/preload.ts',
              onstart(options) {
                options.reload()
              },
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: { external },
                },
              },
            },
          ]),
          renderer(),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
