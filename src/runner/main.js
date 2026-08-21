// runner.html 独立入口：boot 海风球道（开发/独立验证用；主游戏内请走选择面板）
import { bootRunner } from './game.js';

const params = new URLSearchParams(location.search);
bootRunner({
  container: document.getElementById('app') || document.body,
  mode: params.get('mode'),
});
