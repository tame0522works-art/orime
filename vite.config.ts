import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * 公開版に Content Security Policy を入れる。これまでの作品と同じく connect-src 'none' で通信をすべて拒否する。
 * GitHub Pages はレスポンスヘッダーを設定できないので <meta> で入れる。開発サーバーは更新の通知に WebSocket を使うので、ビルドのときだけ入れる。
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'orime-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      // 文字コードの指定より後ろに置く（文字コードは先頭 1024 バイト以内で宣言する必要がある）
      handler: (html) => html.replace('<meta charset="UTF-8" />', `$&\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  }
}

// GitHub Pages ではリポジトリ名の下（/orime/）で配信されるので、CI から BASE_PATH で渡す
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // ほかの作品の開発サーバーと重ならないよう、ポートを固定する
  server: { port: 5211, strictPort: true },
  preview: { port: 5212, strictPort: true },
  plugins: [contentSecurityPolicy(), react()],
})
