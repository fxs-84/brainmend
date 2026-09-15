# Progress

Original prompt: 用户想重做脑科学游戏中的「太空隧道 - 穿越小行星带」：参照微信视频(密智文医生 2024-10-20)里的同类游戏，嫌现有版本太丑、路径太单一、金币排列差。要求画面更丰富、飞船活动路径多样、金币排列更好。

## 已完成
- 重写 `assets/scene-asteroid-tunnel-CdmTd4UQ.js`（原压缩 chunk 无可读源码，直接同路径覆盖为可读实现，接口不变：`SceneAsteroidTunnel` 具名导出，extends `scene-base-h5q7y06u.js` 的 SceneBase，依赖 `particle-Dnitz7s5.js` / `sound-manager-D_9EBJtz.js`）。原版备份在 `tools/scene-asteroid-tunnel-CdmTd4UQ.js.bak`。
- 路径：分段式隧道（calm/sine/sCurve/zigzag/steps/slalom/rest 七种段落），锚点 + 余弦平滑插值，`getTunnelCenterY(x)` / `getGapHalfWidth(x)` 连续可采样；难度随距离提升（缺口收窄、摆幅增大）；`_segHistory` 记录段落史。
- 岩壁：沿锚点区间密铺（步长 0.024，半径 0.030~0.044）形成连续石带，外侧 50% 概率叠大岩第二排；slalom/zigzag/steps 等段有贴壁浮岩强迫小幅闪避。
- 金币阵型：波浪带（波形段）、中线串（zigzag/steps）、双线（slalom）、圆环阵+大金币（rest，gap>0.17，间隔>0.5）。
- 视觉：紫-品红星云、三层星、流星、尘埃、速度线、远景带环行星（已调低存在感）；岩石用离屏精灵缓存（8 外形 × 3 边缘光朝向），帧内 drawImage；缺口侧柔光描边 alpha 0.20。
- 坑（已修）：`init()` 会被引擎二次调用（构造时一次、setScene 时一次），生成水位线 `_rockX/_coinX/_ringDone` 必须在 init 里重置，否则二次初始化后旧水位导致前期不生成岩石/金币。
- 测试：`tests/e2e/tunnel-v2.spec.mjs`（npm run test:e2e:tunnel-v2，自起服务器端口 8795），8 项断言：场景加载、岩石/金币生成、自动驾驶沿中心线 27s 不撞毁、段落类型 ≥3、金币收集、无 JS 错误。截图 `screenshots/tunnel-v2-{1-start,2-mid,3-far}.png`。

## 引擎契约要点（改此场景时必读）
- GameEngine 每帧：`scene.update(dt)` → `scene.renderBackground(ctx,w,h)`（飞船也在此画，`renderPlayer` 留空即可）→ `scene.particles.render(ctx)`（会再画一次粒子，属引擎行为）。
- 玩家：`mapInputToPosition({y})` 返回 `{x:.5, y}`，引擎按 0.45/帧 lerp 跟踪；碰撞 `checkCollision(px,py,hitboxRadius)` 归一化坐标；金币 `checkCoinCollect` 返回被吃数组，引擎每个 +10 分，`onCoinCollect` 播粒子+音效。
- 碰撞宽容期：gameTime < 1.5s 不判碰撞。

## v3 迭代 (用户反馈: 还是丑 + 通道太规则)
- 通道曲线: 锚点间距逐点随机 (0.75~1.35×)、摆幅逐点随机、y 加 ±0.022 高频抖动、gap 逐点 ±10% 抖动。
- 岩壁: 两侧墙独立种子/相位 (不再镜像); 边界噪声让内沿在 0.66g~0.90g 间锯齿化; 密度噪声做疏密石堆; 尺寸 68% 小碎石 / 26% 中岩 / 6% 巨岩; 每颗随机 rot 旋转 + 3 档明暗 (shade)。
- 精灵: 去掉霓虹描边, 改 directional lighting (左上受光缘 + 右下阴影缘, clip 内画), 蓝灰深色系。缓存键 (seed%8)_shade, 24 张 lazy。
- 浮岩改为按区间长度概率, 且保证另一侧走廊 ≥0.35g。

## v4 迭代 (用户反馈: 通道无障碍全畅通 / 金币太多 / 陨石丑, 附参考图)
- 障碍: 改为散布式陨石场 —— 岩石全高度随机散布, 仅走廊"安全半径" (max(0.055, 0.62g)) 内不生成; 加闸门事件 `_spawnGate`: 每 1.8~3.2 世界单位一道几乎封死的岩柱, 只留窗口 (winHalf 0.10~0.13, winC 贴近走廊中心保证可过), 窗口中心放引导金币。
- 金币: 稀疏化 —— 45% 单颗 / 35% 3 颗短弧 / 20% 4 颗短串, 间隔 0.10~0.40; rest 段圆环阵间隔放宽到 0.8。同屏 ~5-10 颗。
- 精灵: 炭黑岩体 + 3~4 个白色陨坑圈 (亮白环 + 深坑底 + 坑内阴影弧) + 碎石纹 + 左上受光缘, 即参考图的"骷髅圈"高对比造型。
- 装饰: 4 颗中场粉色发光球 (pinkOrbs, 纯装饰无碰撞, 脉动光晕)。

## v5 迭代 (用户反馈: 坑不能全是圆形 / 通道还可以更复杂)
- 精灵: 陨坑改不规则形 —— 7 点抖动多边形坑 (2/3) + 旋转椭圆坑 (1/3), 白圈环跟随不规则路径; 加 1~2 条锯齿裂纹 (边缘向内, 带微反光); 轮廓分两族 (棱角 9 边形 / 圆润 12 边形); 变体 8→10 形。
- 段型 +3: osc (高频碎波, 3 波小摆幅), pinch (中段缺口急收窄 45%), funnel (缺口持续收窄); 波形段统一叠加 3.7× 次级涟漪。
- 难度曲线修正 (关键 bug): `_difficulty` 原来按 genX/90, 一局 90s (约 9 世界单位) 难度只走 10%, 新段型解锁阈值 (5~14) 和首闸门 (x=4.0) 一局内几乎触发不到 → 这才是"通道单一"的根因。改为 /12 (~2 分钟拉满), 解锁阈值 1.5/2/2.5/3.5/4.5, 首闸门 1.5, 闸门间隔 1.0~2.0。
- 散布密度: 双颗率 35%→45%。

## v6 迭代 (用户反馈: 陨石不立体 / 通道散乱, 重读参考图后的纠偏)
- 结构纠偏: 参考图是"峡谷+障碍"而非全场乱撒 —— 恢复两侧成堆岩壁作为通道主结构 (v3 密铺逻辑, edge 0.85g±0.15), 走廊内障碍改为稀疏散布 (0.05~0.10 步长, 且不超过 0.95g 免得和墙叠合), 闸门保留。
- 立体化纠偏: 参考的"白圈"是受光坑缘不是白圆环 —— 岩体改强体积光径向渐变 (亮部集中左上前光区, 整体中灰), 陨坑改椭圆浅坑 (灰黑坑底渐变 + 上缘淡亮月牙 + 下缘暗月牙), 去掉裂纹 (显乱), 穹顶高光/边缘光都压克制; 棱角轮廓方差 0.74→0.79 减尖刺感。

## v7 迭代 (用户反馈: 审美差/陨石巨丑/通道没想象力)
- 关键领悟: 参考是"深石白圈"不是"灰石黑洞" —— 岩体压暗 (#4e5368→#0f1015), 陨坑细白亮圈 (alpha .85, lw cs*.16) + 深坑底, 土豆轮廓 (平滑小方差, 去掉棱角族), 表面细颗粒, 边缘光克制。
- 通道想象力: ①走廊微光引导带 `_drawCorridorGlow` (沿中心两层半透亮带 1.0g/0.45g); ②障碍石岛 (走廊内 2~3 颗一小堆, off=max(0.68~0.85g, safe+0.06) 且 <0.95g, 宽走廊才出); ③rest 宽穴 gap 上限 0.26→0.30。

## v8 迭代 (用户定方向: 宽通道+障碍改变轨迹, 不要收窄不要规则曲线)
- 生成: 去掉岩壁/走廊光带; baseGap 0.16→0.24 (宽), 去掉 pinch/funnel; 段型摆幅减半。
- 障碍: 每区间 2~4 堆 (一堆 2~4 颗) 全高度散布, 车道安全区收窄到 max(0.05, 0.4g) 让障碍压近; 车道正中每 0.8~1.6 单位放"逼迫石" (g>0.15 时, 上下皆可绕, 绕行侧放引导金币); 难度只加障碍密度不加收窄; 闸门窗口放宽 0.13~0.17。
- 精灵 v8: 深色岩体 (#42465a→#0d0e13) + 手绘白描边 (两道粗细不一) + 抖动白圈坑 (9 点 wobble 路径, 非正圆) —— 插画感。
- 测试: 自动驾驶升级为避障转向 (扫 dy∈[-0.16,0.16] 候选, 按最近障碍距离减中心偏置打分), 否则中心逼迫石必撞。

## 游戏卡片选择面板 (脑科学游戏)
- bundle 原生 #game-select-panel 用 CSS `display:none!important` 隐藏, 另建 `#game-cards` 覆盖层 (z-index 9998, 深空渐变, 卡片=游戏截图+标题+简介)。
- 7 张卡片 = 太空射击/山谷飞行/太空3D飞行/前庭固视/太空点头/太空隧道/公路赛车; 截图取自真实游戏画面 (sharp 缩到 480 宽, 存 assets/game-cards/*.png, 各 80~150KB)。山谷/点头截图是 Playwright 实机截取 (screenshots/game-card-src-*.png)。
- 点击卡片 → 程序化点击隐藏原面板的 scene/mode 按钮 + #start-game-btn 开始; 公路赛车卡两步: 先展开 简单/普通/困难, 直接写 window._easyMode/_roadSpeedConfig (PRESETS 参数内联在 index.html)。
- 面板显隐同步: 轮询等面板创建 → MutationObserver 盯 style.display, attach 后立即同步一次 (防竞态); ⚠️ 不要在 sync 里改 panel 自身的 display, 否则 mutation 自触发把覆盖层关掉。
- 返回按钮 → 点 #game-back-to-menu, 拦截器自然回到头动追踪大卡片菜单。
- 补漏 (用户指出"还有几个没做出来"): 面板里还有 5 个注入类游戏 —— 回声编织者一/二章 (vorch1/vorch2)、海风球道 (runner)、节拍打地鼠 (mole)、公路赛车3D (road3d, 第一视角摩托), 由 src/*/integrate.js 轮询 panel.offsetParent 注入。隐藏面板不能用 display:none (offsetParent 恒 null → 注入永远不发生), 改用 visibility:hidden + 移出屏外。注入按钮异步出现, startGameCard 对 mode 按钮轮询 (200ms×25) 后再点开始; 这 5 个游戏点 mode 设 window.gameUI.selectedMode, 开始按钮被对应 integrate 捕获转发。卡片截图: vor-ch1-active / ch2-1-idle / runner-1-game / mole-game / 3d-final。
- 2D/3D 拆分 (用户指出 3D 摩托入口丢失): 原"公路赛车"卡是 bundle 2D 版 (竖版俯视), 3D 摩托 (road3d) 是 game-3d 注入的独立入口。现在两张卡: 公路赛车(2D, 直接开始) + 公路赛车 3D(第一视角, 保留简单/普通/困难两步 —— _roadSpeedConfig/_easyMode 只有 src/game-3d/engine.js 消费)。road.png 截自 2D 实机 (竖版公路), road3d.png 用 3D 第一视角图。
- e2e: tests/e2e/game-cards.spec.mjs (13 断言); tracking-menu.spec 对应断言已同步更新。

## TODO / 建议
- 金币收集半径 38px，自动驾驶截图里金币会与飞船短暂重叠（不影响游玩）；介意可加大到 42。
- rest 段圆环阵在极小概率下与带环行星视觉重叠，可再调。
- 移动端实机（陀螺仪点头）未验证手感，桌面 autopilot 验证的是几何可通行性；建议真机试玩调 gap/速度曲线。
- 若未来重新构建 bundle，注意此 chunk 会被覆盖——可读实现只存在 assets 里。
