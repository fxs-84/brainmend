import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (!existsSync(resolve('dist/index.html'))) throw new Error('dist/index.html 不存在，请先完成 Vite 构建');

function copyDirectory(source, destination) {
  mkdirSync(destination, { recursive: true });
  readdirSync(source, { withFileTypes: true }).forEach(entry => {
    const input = join(source, entry.name);
    const output = join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(input, output);
    else if (entry.isFile()) copyFileSync(input, output);
  });
}

copyDirectory(resolve('assets'), resolve('dist/assets'));
console.log('静态资源已复制到 dist/assets');
