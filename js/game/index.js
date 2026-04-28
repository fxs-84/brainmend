// ============================================================
// GAME MODULE - 颈椎康复游戏系统
// ============================================================

// Core modules
export { GameEngine, GameState } from './engine.js';
export { InputAdapter } from './input-adapter.js';
export { MotionMapper } from './motion-mapper.js';

// Collision & Scoring
export { CollisionDetector } from './collision.js';
export { ScoringSystem } from './scoring.js';
export { DifficultyManager } from './difficulty.js';

// Cervical Ability Assessment
export { HeadMotionRecorder } from './head-recorder.js';
export { CervicalAbilityScorer } from './cervical-scorer.js';

// Scenes
export { SceneBase } from './scene-base.js';
export { SceneSpace } from './scene-space.js';
export { SceneRoad } from './scene-road.js';
export { SceneBall } from './scene-ball.js';

// Obstacles
export { Obstacle, ObstacleMeteor, ObstacleVehicle, ObstacleBall, ObstacleCoin } from './obstacle.js';
export { ObstacleGate } from './obstacle.js';
export { ObstacleWave } from './obstacle.js';
export { ObstacleSpiral } from './obstacle.js';

// Particles
export { Particle, ParticleSystem } from './particle.js';

// UI
export { GameUI } from './ui-game.js';
