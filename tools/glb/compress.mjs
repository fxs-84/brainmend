// GLB 压缩管线（Draco 几何 + WebP 纹理 + 缩到 1024px）
// 依赖：@gltf-transform/core + extensions + functions + draco3dgltf（WebP 通过 gltf-transform 内置 encoder，无需 sharp/ktx）
//   dedup → prune → textureCompress(WebP) → draco → save
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILES = ['spaceship', 'enemy', 'scene-prop'];
const IN_DIR = 'assets/3d';
const OUT_DIR = 'assets/3d/compressed';
const TEX_MAX = 1024;
const DRACO_LEVEL = 10;

const io = new NodeIO();
io.registerExtensions(ALL_EXTENSIONS);
io.registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule()
});

async function compress(name) {
  const inPath = path.join(IN_DIR, name + '.glb');
  const outPath = path.join(OUT_DIR, name + '.glb');
  const t0 = Date.now();
  const doc = await io.read(inPath);
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ targetFormat: 'webp', resize: [TEX_MAX, TEX_MAX] }),
    draco({ method: 'edgebreaker', encodeSpeed: DRACO_LEVEL, decodeSpeed: DRACO_LEVEL })
  );
  await io.write(outPath, doc, { binary: true });
  const t1 = Date.now();
  const origSize = (await fs.stat(inPath)).size;
  const newSize = (await fs.stat(outPath)).size;
  const ratio = (newSize / origSize * 100).toFixed(1);
  console.log(`  ${name}: ${(origSize/1024/1024).toFixed(1)}MB -> ${(newSize/1024/1024).toFixed(1)}MB (${ratio}%) in ${t1-t0}ms`);
  return { origSize, newSize };
}

console.log('Compressing GLB to', OUT_DIR);
let totalO = 0, totalN = 0;
for (const f of FILES) {
  try {
    const r = await compress(f);
    totalO += r.origSize; totalN += r.newSize;
  } catch (e) {
    console.error(`FAIL ${f}:`, e.message);
    process.exit(1);
  }
}
console.log(`Total: ${(totalO/1024/1024).toFixed(1)}MB -> ${(totalN/1024/1024).toFixed(1)}MB (${(totalN/totalO*100).toFixed(1)}%)`);