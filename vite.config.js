import { defineConfig } from 'vite';

// GitHub Pages 子路径部署：仓库 https://github.com/fxs-84/brainmend
// 上线地址为 https://fxs-84.github.io/brainmend/
// 资源需要 base = '/brainmend/' 才能正确解析
//
// 如未来迁到自定义域名/根路径部署，只需把 BASE 改成 '/' 或对应路径
const BASE = '/brainmend/';

export default defineConfig({
  base: BASE,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 多页入口: Vite 默认只打包 index.html, 独立页面必须在 rollupOptions.input 登记
    // (vor/runner/questionnaire 等旧页面未登记, 线上 404 —— 属既有遗留, 本次仅接入 balance-test)
    rollupOptions: {
      input: ['index.html', 'balance-test.html'],
    },
    assetsInlineLimit: 0,
    // Vite 8 默认 CSS 压缩器是 lightningcss，遇到项目里某些第三方 CSS 段会抛
    // "Unexpected end of input"。esbuild 是更稳的备选（需独立装包），
    // 这里先关掉 minify 让构建跑通；后续如要恢复可 `npm i -D esbuild` 并改回 'esbuild'。
    cssMinify: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
