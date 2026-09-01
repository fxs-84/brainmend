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
    // 入口 HTML 较多（index / vor / vor-ch2 / runner / questionnaire / imu-demo 等），
    // Vite 默认会扫描根目录所有 *.html 作为入口，无需手动 rollupOptions.input
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
