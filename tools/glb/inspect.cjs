// GLB 头解析：提取 assets 数 / 类型 / 节点数 / 缓冲大小等结构信息
const fs = require('fs');

function countNodes(ns) {
  if (!ns) return 0;
  let c = 0;
  for (const n of ns) { c++; c += countNodes(n.children || []); }
  return c;
}

const TYPES = ['buffer', 'image', 'material', 'mesh', 'node', 'skin', 'animation', 'texture'];

for (const name of ['spaceship', 'enemy', 'coin']) {
  const buf = fs.readFileSync('assets/3d/' + name + '.glb');
  const magic = buf.slice(0, 4).toString('ascii');
  const ver = buf.readUInt32LE(4);
  const len = buf.readUInt32LE(8);
  const jcLen = buf.readUInt32LE(12);
  const jcType = buf.slice(16, 20).toString('ascii');
  const jsonStart = 20, jsonEnd = 20 + jcLen;
  const json = JSON.parse(buf.slice(jsonStart, jsonEnd).toString('utf8'));
  const types = [...new Set((json.assets || []).map(a => TYPES.find(t => a[t] !== undefined)).filter(Boolean))];
  console.log('===', name);
  console.log('   magic:', magic, 'ver:', ver, 'len:', len, 'chunk:', jcType, '(' + jcLen + 'B)');
  console.log('   assets:', (json.assets || []).length, 'types:', types.join(','));
  console.log('   meshes:', (json.meshes || []).length,
              'materials:', (json.materials || []).length,
              'textures:', (json.textures || []).length,
              'images:', (json.images || []).length,
              'animations:', (json.animations || []).length);
  console.log('   nodes (root):', (json.nodes || []).length,
              'recursively:', countNodes(json.nodes || []));
  const bins = (json.buffers || []).map(b => b.byteLength).join(', ');
  console.log('   buffer sizes:', bins || '(none — using GLB embedded)');
  console.log('   extensions:', json.extensionsUsed ? Object.keys(json.extensionsUsed).join(',') : '(none)');
  const scene = (json.scenes || [])[0];
  if (scene) console.log('   scene root nodes:', (scene.nodes || []).length, '— first node name:', (json.nodes || [])[scene.nodes[0]]?.name || '(unnamed)');
  // bound check
  let meshBounds = null;
  for (const m of (json.meshes || [])) {
    const acc = (m.primitives || []).reduce((a, p) => a + (p.attributes && p.attributes.POSITION != null ? 1 : 0), 0);
    if (acc > 0) { meshBounds = acc; break; }
  }
  console.log('   meshes with POSITION attr:', meshBounds);
}