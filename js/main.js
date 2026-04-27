// ============================================================
// MAIN ENTRY POINT - 游戏模块入口
// ============================================================

// 游戏引擎相关
import { GameEngine, GameState } from './game/engine.js';
import { InputAdapter } from './game/input-adapter.js';
import { MotionMapper } from './game/motion-mapper.js';
import { CollisionDetector } from './game/collision.js';
import { ScoringSystem } from './game/scoring.js';
import { DifficultyManager } from './game/difficulty.js';

// 场景
import { SceneBase } from './game/scene-base.js';
import { SceneSpace } from './game/scene-space.js';
import { SceneRoad } from './game/scene-road.js';
import { SceneBall } from './game/scene-ball.js';

// 障碍物
import { Obstacle, ObstacleMeteor, ObstacleVehicle, ObstacleBall } from './game/obstacle.js';

// 评估
import { HeadMotionRecorder } from './game/head-recorder.js';
import { CervicalAbilityScorer } from './game/cervical-scorer.js';

// UI
import { GameUI } from './game/ui-game.js';

// 导出到全局（供 events.js 使用）
window.GameModule = {
    GameEngine,
    GameState,
    InputAdapter,
    MotionMapper,
    CollisionDetector,
    ScoringSystem,
    DifficultyManager,
    SceneBase,
    SceneSpace,
    SceneRoad,
    SceneBall,
    Obstacle,
    ObstacleMeteor,
    ObstacleVehicle,
    ObstacleBall,
    HeadMotionRecorder,
    CervicalAbilityScorer,
    GameUI
};

console.log('Game module loaded');
