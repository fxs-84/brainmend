// ============================================================
// APP ENTRY POINT - 应用入口
// 按正确顺序导入所有模块
// ============================================================

// 1. 基础配置和状态（无依赖）
import './config.js';
import './state.js';

// 2. 独立模块（无依赖）
import './tts.js';
import './charts.js';

// 3. 画布和绘图（依赖 config, state）
import './canvas.js';
import './drawing.js';

// 4. 输入（需要 canvas 的 crosshairSize/ringRadius 在事件处理中使用）
import './input.js';

// 5. UI 和检测（依赖 config, state, canvas）
import './ui.js';
import './detection.js';

// 6. 游戏模块（已模块化）
import './main.js';

// 7. 事件绑定（最后加载，绑定所有事件）
import { init } from './events.js';

// 8. 初始化应用
if (document.readyState === 'complete') {
    setTimeout(init, 100);
} else {
    window.addEventListener('load', () => setTimeout(init, 100));
}

console.log('App initialized');
