// vor-ch2.html 独立入口：boot 第二章 demo（开发/独立验证用；主游戏内请走选择面板）
import { bootVorCh2 } from './demo-ch2.js';

const params = new URLSearchParams(location.search);
bootVorCh2({
  container: document.getElementById('app') || document.body,
  mode: params.get('mode'),
  overrides: {
    blocks: params.has('blocks') ? parseInt(params.get('blocks'), 10) : undefined,
    active: params.has('active') ? parseFloat(params.get('active')) : undefined,
    rest: params.has('rest') ? parseFloat(params.get('rest')) : undefined,
  },
});
