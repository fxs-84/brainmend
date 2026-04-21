// ============================================================
// GAME MODULE - 颈椎康复游戏系统 (Combined)
// ============================================================

// Re-export from existing modules
const { state } = window;

// ============================================================
// MOTION MAPPER - 运动轴映射
// ============================================================
const MotionMapper = {
    MODES: {
        SINGLE_PITCH: 'single_pitch',
        SINGLE_YAW: 'single_yaw',
        SINGLE_ROLL: 'single_roll',
        DUAL_PITCH_YAW: 'dual_pitch_yaw',
        TRIPLE: 'triple'
    },

    AXIS_MAP: {
        single_pitch: ['pitch'],
        single_yaw: ['yaw'],
        single_roll: ['roll'],
        dual_pitch_yaw: ['pitch', 'yaw'],
        triple: ['pitch', 'yaw', 'roll']
    },

    mapToGame(input, mode) {
        const { pitch = 0, yaw = 0, roll = 0 } = input;
        let x = 0.5, y = 0.5;

        switch (mode) {
            case this.MODES.SINGLE_PITCH:
                y = 0.5 - pitch * 0.4;
                break;
            case this.MODES.SINGLE_YAW:
                x = 0.5 + yaw * 0.4;
                break;
            case this.MODES.SINGLE_ROLL:
                x = 0.5 + roll * 0.4;
                break;
            case this.MODES.DUAL_PITCH_YAW:
                x = 0.5 + yaw * 0.4;
                y = 0.5 - pitch * 0.4;
                break;
            case this.MODES.TRIPLE:
                x = 0.5 + yaw * 0.4 + roll * 0.1;
                y = 0.5 - pitch * 0.4;
                break;
        }

        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        return { x, y };
    },

    getActiveAxes(mode) {
        return this.AXIS_MAP[mode] || [];
    },

    getModeName(mode) {
        const names = {
            single_pitch: '单轴(上下)',
            single_yaw: '单轴(左右)',
            single_roll: '单轴(侧倾)',
            dual_pitch_yaw: '双轴(上下+左右)',
            triple: '三轴(综合)'
        };
        return names[mode] || mode;
    }
};

// ============================================================
// INPUT ADAPTER - 输入适配器
// ============================================================
class InputAdapter {
    constructor() {
        this.inputSource = 'mouse';
        this.mouseX = 0.5;
        this.mouseY = 0.5;
        this.motionMode = MotionMapper.MODES.TRIPLE;
        this.initialized = false;
    }

    init() {
        if (this.isGyroscopeAvailable()) {
            this.inputSource = 'gyroscope';
        }
        this.bindMouseEvents();
        this.bindKeyboardEvents();
        this.initialized = true;
    }

    isGyroscopeAvailable() {
        return window.DeviceOrientationEvent !== undefined;
    }

    bindMouseEvents() {
        const canvas = document.getElementById('game-canvas') || document.getElementById('canvas');
        if (!canvas) return;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseX = (e.clientX - rect.left) / rect.width;
            this.mouseY = (e.clientY - rect.top) / rect.height;
        });
    }

    bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            const step = 0.02;
            switch (e.key) {
                case 'ArrowUp': case 'w': case 'W':
                    this.mouseY = Math.max(0, this.mouseY - step); break;
                case 'ArrowDown': case 's': case 'S':
                    this.mouseY = Math.min(1, this.mouseY + step); break;
                case 'ArrowLeft': case 'a': case 'A':
                    this.mouseX = Math.max(0, this.mouseX - step); break;
                case 'ArrowRight': case 'd': case 'D':
                    this.mouseX = Math.min(1, this.mouseX + step); break;
            }
        });
    }

    getPosition() {
        if (this.inputSource === 'gyroscope') {
            const pitch = (state.pitch - state.pitchOffset) / 45;
            const yaw = (state.yaw - state.yawOffset) / 80;
            const roll = (state.roll - state.rollOffset) / 45;
            return MotionMapper.mapToGame({ pitch, yaw, roll }, this.motionMode);
        }
        return { x: this.mouseX, y: this.mouseY };
    }

    setMotionMode(mode) {
        this.motionMode = mode;
    }

    getMotionMode() {
        return this.motionMode;
    }
}

// ============================================================
// COLLISION DETECTOR - 碰撞检测
// ============================================================
const CollisionDetector = {
    checkPlayerObstacle(player, obstacle, canvas) {
        if (!player || !obstacle) return false;
        const playerX = player.x * canvas.width;
        const playerY = player.y * canvas.height;
        const playerRadius = player.hitboxRadius * Math.min(canvas.width, canvas.height);
        const obstacleX = obstacle.x * canvas.width;
        const obstacleY = obstacle.y * canvas.height;
        const obstacleRadius = obstacle.radius * Math.min(canvas.width, canvas.height);
        const dx = obstacleX - playerX;
        const dy = obstacleY - playerY;
        return Math.sqrt(dx * dx + dy * dy) < (playerRadius + obstacleRadius);
    }
};

// ============================================================
// SCORING SYSTEM - 评分系统
// ============================================================
class ScoringSystem {
    static WEIGHTS = { survival: 0.4, obstacleAvoid: 0.4, fluidity: 0.2 };
    static GRADE_THRESHOLDS = { S: 90, A: 80, B: 70, C: 60, D: 0 };

    constructor() { this.reset(); }

    reset() {
        this.currentScore = 0;
        this.survivalScore = 0;
        this.avoidScore = 0;
        this.fluidityScore = 0;
        this.obstaclesDodged = 0;
        this.positionHistory = [];
        this.maxHistoryLength = 60;
    }

    getCurrentScore() { return this.currentScore; }

    getFinalScore() {
        return (this.survivalScore * ScoringSystem.WEIGHTS.survival +
                this.avoidScore * ScoringSystem.WEIGHTS.obstacleAvoid +
                this.fluidityScore * ScoringSystem.WEIGHTS.fluidity);
    }

    calculateFrameScore(player, obstacles, dt, difficultyLevel) {
        this.survivalScore += 10 * dt * difficultyLevel;
        const centerDistance = Math.sqrt(Math.pow(player.x - 0.5, 2) + Math.pow(player.y - 0.5, 2));
        this.avoidScore += (1 - centerDistance * 2) * 5 * dt;
        this.positionHistory.push({ x: player.x, y: player.y });
        if (this.positionHistory.length > this.maxHistoryLength) this.positionHistory.shift();
        if (this.positionHistory.length >= 10) {
            this.fluidityScore = this.calculateFluidity(this.positionHistory) * 100;
        }
        this.currentScore = this.getFinalScore();
    }

    calculateFluidity(history) {
        if (history.length < 2) return 1;
        let totalChange = 0;
        for (let i = 1; i < history.length; i++) {
            const dx = history[i].x - history[i-1].x;
            const dy = history[i].y - history[i-1].y;
            totalChange += Math.sqrt(dx * dx + dy * dy);
        }
        const avgChange = totalChange / (history.length - 1);
        const ratio = avgChange / 0.01;
        return ratio >= 1 ? Math.max(0, 1 - (ratio - 1) * 0.5) : ratio;
    }

    onCollision() {}
    onObstacleDodged() { this.obstaclesDodged++; this.avoidScore += 50; }
    onNearMiss() { this.nearMisses++; this.avoidScore += 20; }

    getGrade(score) {
        const s = score || this.getFinalScore();
        if (s >= ScoringSystem.GRADE_THRESHOLDS.S) return 'S';
        if (s >= ScoringSystem.GRADE_THRESHOLDS.A) return 'A';
        if (s >= ScoringSystem.GRADE_THRESHOLDS.B) return 'B';
        if (s >= ScoringSystem.GRADE_THRESHOLDS.C) return 'C';
        return 'D';
    }
}

// ============================================================
// DIFFICULTY MANAGER - 难度管理器
// ============================================================
class DifficultyManager {
    static CONFIG = {
        1: { spawnInterval: 2500, speedMultiplier: 0.8, maxObstacles: 3, types: ['small', 'medium'] },
        2: { spawnInterval: 2000, speedMultiplier: 1.0, maxObstacles: 4, types: ['small', 'medium', 'medium'] },
        3: { spawnInterval: 1500, speedMultiplier: 1.2, maxObstacles: 6, types: ['small', 'medium', 'large', 'medium'] },
        4: { spawnInterval: 1100, speedMultiplier: 1.5, maxObstacles: 8, types: ['medium', 'large', 'fast', 'medium'] },
        5: { spawnInterval: 800, speedMultiplier: 1.8, maxObstacles: 10, types: ['large', 'fast', 'random', 'fast'] }
    };
    static LEVEL_UP_TIME = [0, 20, 45, 75, 120];

    constructor() { this.reset(); }

    reset() {
        this.level = 1;
        this.timePlayed = 0;
        this.lastSpawnTime = 0;
    }

    advance(gameTime) {
        this.timePlayed = gameTime;
        for (let i = DifficultyManager.LEVEL_UP_TIME.length - 1; i >= 0; i--) {
            if (gameTime >= DifficultyManager.LEVEL_UP_TIME[i]) { this.level = i + 1; break; }
        }
        return this.getCurrentConfig();
    }

    getCurrentLevel() { return this.level; }
    getCurrentConfig() { return DifficultyManager.CONFIG[this.level] || DifficultyManager.CONFIG[1]; }
    getSpawnInterval() { return this.getCurrentConfig().spawnInterval; }
    getSpeedMultiplier() { return this.getCurrentConfig().speedMultiplier; }
    getMaxObstacles() { return this.getCurrentConfig().maxObstacles; }
    recordSpawn() { this.lastSpawnTime = this.timePlayed; }
}

// ============================================================
// OBSTACLE - 障碍物基类
// ============================================================
class Obstacle {
    constructor(config = {}) {
        this.x = config.x || 0.5;
        this.y = config.y || 0;
        this.radius = config.radius || 0.03;
        this.speedY = config.speedY || 0.1;
        this.speedX = config.speedX || 0;
        this.rotation = 0;
        this.rotationSpeed = config.rotationSpeed || 0;
        this.type = config.type || 'basic';
        this.color = config.color || '#EF4444';
    }

    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.y += this.speedY * dt * speedMultiplier;
        this.rotation += this.rotationSpeed * dt;
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.y > 1.1 || this.y < -0.1 || this.x < -0.1 || this.x > 1.1;
    }

    getPixelPosition(canvasWidth, canvasHeight) {
        return {
            x: this.x * canvasWidth,
            y: this.y * canvasHeight,
            radius: this.radius * Math.min(canvasWidth, canvasHeight)
        };
    }
}

class ObstacleMeteor extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || Math.random() * 0.8 + 0.1,
            y: config.y || -0.1,
            radius: config.size === 'small' ? 0.025 : config.size === 'large' ? 0.05 : 0.035,
            speedY: 0.15,
            speedX: (Math.random() - 0.5) * 0.05,
            rotationSpeed: (Math.random() - 0.5) * 2,
            type: 'meteor',
            color: '#8B5CF6'
        });
        this.sizeType = config.size || 'medium';
    }

    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(this.rotation);
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
            const angle = (i / 7) * Math.PI * 2;
            const r = pos.radius * (0.7 + Math.random() * 0.3);
            i === 0 ? ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r) : ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#A78BFA';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
}

class ObstacleVehicle extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 0.5,
            y: config.y || -0.1,
            radius: 0.04,
            speedY: 0.12,
            type: 'vehicle',
            color: '#3B82F6'
        });
        this.width = 0.08;
        this.height = 0.06;
        this.lane = config.lane || 0;
    }

    update(dt, speedMultiplier = 1) {
        this.y += this.speedY * dt * speedMultiplier;
    }

    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        const w = this.width * ctx.canvas.width;
        const h = this.height * ctx.canvas.height;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = this.color;
        ctx.fillRect(-w/2, -h/2, w, h);
        ctx.fillStyle = '#1E3A5F';
        ctx.fillRect(-w/3, -h/3, w * 0.6, h * 0.4);
        ctx.restore();
    }
}

class ObstacleBall extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 0.5,
            y: config.y || -0.1,
            radius: 0.035,
            speedY: 0.18,
            speedX: (Math.random() - 0.5) * 0.1,
            type: 'ball',
            color: '#F59E0B'
        });
        this.gravity = 0.05;
    }

    update(dt, speedMultiplier = 1) {
        this.speedY += this.gravity * dt;
        this.y += this.speedY * dt * speedMultiplier;
        this.x += this.speedX * dt;
    }

    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.beginPath();
        ctx.arc(0, 0, pos.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#FCD34D';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-pos.radius * 0.3, -pos.radius * 0.3, pos.radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
        ctx.restore();
    }
}

// ============================================================
// SCENE BASE - 场景基类
// ============================================================
class SceneBase {
    constructor() { this.engine = null; this.obstacles = []; this.lastSpawnTime = 0; this.gameTime = 0; }
    init(engine) { this.engine = engine; this.obstacles = []; this.lastSpawnTime = 0; this.gameTime = 0; }
    update(dt) { this.gameTime += dt; }
    trySpawnObstacle(obstacleList, difficultyConfig) {
        const timeSinceLastSpawn = this.gameTime - this.lastSpawnTime;
        if (obstacleList.length < difficultyConfig.maxObstacles &&
            timeSinceLastSpawn >= difficultyConfig.spawnInterval / 1000) {
            const obstacle = this.spawnObstacle(difficultyConfig);
            if (obstacle) { obstacleList.push(obstacle); this.lastSpawnTime = this.gameTime; }
        }
    }
    spawnObstacle() { return null; }
    mapInputToPosition(inputPos) { return inputPos; }
    cleanup() { this.obstacles = []; }
}

class SceneSpace extends SceneBase {
    constructor() {
        super();
        this.stars = [];
        this.generateStars();
    }

    generateStars() {
        this.stars = [];
        for (let i = 0; i < 100; i++) {
            this.stars.push({
                x: Math.random(), y: Math.random(),
                size: Math.random() * 0.003 + 0.001,
                speed: Math.random() * 0.2 + 0.05,
                brightness: Math.random()
            });
        }
    }

    init(engine) {
        super.init(engine);
        this.generateStars();
    }

    update(dt) {
        super.update(dt);
        for (const star of this.stars) {
            star.y += star.speed * dt;
            if (star.y > 1) { star.y = 0; star.x = Math.random(); }
        }
    }

    renderBackground(ctx, width, height) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0, 0, width, height);
        for (const star of this.stars) {
            const x = star.x * width, y = star.y * height;
            const size = star.size * Math.min(width, height);
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness * 0.8})`;
            ctx.fill();
        }
    }

    spawnObstacle(difficultyConfig) {
        const types = difficultyConfig.types;
        const type = types[Math.floor(Math.random() * types.length)];
        const sizeMap = { small: 'small', medium: 'medium', large: 'large', fast: 'medium', random: ['small', 'medium', 'large'][Math.floor(Math.random() * 3)] };
        return new ObstacleMeteor({ size: sizeMap[type] || 'medium' });
    }

    mapInputToPosition(inputPos) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.TRIPLE;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}

class SceneRoad extends SceneBase {
    constructor() {
        super();
        this.roadLines = [];
        this.lineSpeed = 0.3;
        this.initRoadLines();
    }

    initRoadLines() {
        this.roadLines = [];
        for (let i = 0; i < 8; i++) {
            this.roadLines.push({ y: i * 0.15, visible: i % 2 === 0 });
        }
    }

    init(engine) {
        super.init(engine);
        this.initRoadLines();
    }

    update(dt) {
        super.update(dt);
        for (const line of this.roadLines) {
            line.y += this.lineSpeed * dt;
            if (line.y > 1.2) line.y = -0.1;
        }
    }

    renderBackground(ctx, width, height) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.4);
        gradient.addColorStop(0, '#1E3A5F');
        gradient.addColorStop(1, '#3B82F6');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height * 0.4);
        ctx.fillStyle = '#374151';
        ctx.fillRect(0, height * 0.3, width, height * 0.7);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(0, height * 0.3, width, 5);
        ctx.fillRect(0, height - 5, width, 5);
        const centerX = width * 0.5;
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const line of this.roadLines) {
            if (!line.visible) continue;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(centerX - 5, line.y * height, 10, 30);
        }
    }

    spawnObstacle(difficultyConfig) {
        const lane = Math.random() < 0.5 ? 0 : 1;
        return new ObstacleVehicle({ x: lane === 0 ? 0.3 : 0.7, lane });
    }

    mapInputToPosition(inputPos) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.DUAL_PITCH_YAW;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}

class SceneBall extends SceneBase {
    constructor() { super(); }

    renderBackground(ctx, width, height) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#22C55E');
        gradient.addColorStop(1, '#16A34A');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2);
        ctx.stroke();
    }

    spawnObstacle(difficultyConfig) {
        const colors = ['#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];
        return new ObstacleBall({ color: colors[Math.floor(Math.random() * colors.length)] });
    }

    mapInputToPosition(inputPos) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.TRIPLE;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}

// ============================================================
// GAME ENGINE - 游戏引擎核心
// ============================================================
const GameState = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };

class GameEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = GameState.MENU;
        this.previousState = null;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.gameTime = 0;
        this.input = new InputAdapter();
        this.scoring = new ScoringSystem();
        this.difficulty = new DifficultyManager();
        this.currentScene = null;
        this.player = { x: 0.5, y: 0.5, width: 0.04, height: 0.04, hitboxRadius: 0.02 };
        this.obstacles = [];
        this.animationFrameId = null;
        this.gameLoop = this.gameLoop.bind(this);
    }

    init() {
        this.input.init();
        this.reset();
    }

    reset() {
        this.gameTime = 0;
        this.player.x = 0.5;
        this.player.y = 0.5;
        this.obstacles = [];
        this.scoring.reset();
        this.difficulty.reset();
        if (this.currentScene) this.currentScene.cleanup();
    }

    setState(newState) {
        if (this.state === newState) return;
        this.previousState = this.state;
        this.state = newState;
        switch (newState) {
            case GameState.PLAYING:
                if (this.previousState === GameState.MENU || this.previousState === GameState.GAMEOVER) {
                    this.reset();
                    this.lastTime = performance.now();
                    this.startGameLoop();
                } else if (this.previousState === GameState.PAUSED) {
                    this.lastTime = performance.now();
                    this.startGameLoop();
                }
                break;
            case GameState.PAUSED:
            case GameState.MENU:
                this.stopGameLoop();
                break;
            case GameState.GAMEOVER:
                this.stopGameLoop();
                break;
        }
    }

    startGameLoop() {
        if (this.animationFrameId) return;
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    }

    stopGameLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    gameLoop(timestamp) {
        this.deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (this.deltaTime > 0.1) this.deltaTime = 0.1;
        if (this.state === GameState.PLAYING) this.gameTime += this.deltaTime;
        this.update(this.deltaTime);
        this.render();
        if (this.state === GameState.PLAYING || this.state === GameState.PAUSED) {
            this.animationFrameId = requestAnimationFrame(this.gameLoop);
        }
    }

    update(dt) {
        if (this.state !== GameState.PLAYING) return;
        const difficultyConfig = this.difficulty.advance(this.gameTime);
        this.updatePlayer();
        if (this.currentScene) this.currentScene.update(dt);
        this.updateObstacles(dt);
        this.checkCollisions();
        this.scoring.calculateFrameScore(this.player, this.obstacles, dt, difficultyConfig.level);
    }

    updatePlayer() {
        const inputPos = this.input.getPosition();
        const mappedPos = this.currentScene
            ? this.currentScene.mapInputToPosition(inputPos, this.player)
            : inputPos;
        this.player.x = mappedPos.x;
        this.player.y = mappedPos.y;
    }

    updateObstacles(dt) {
        const difficultyConfig = this.difficulty.getCurrentConfig();
        if (this.currentScene) {
            this.currentScene.trySpawnObstacle(this.obstacles, difficultyConfig);
        }
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            this.obstacles[i].update(dt, difficultyConfig.speedMultiplier);
            if (this.obstacles[i].isOffScreen(this.canvas.width, this.canvas.height)) {
                this.obstacles.splice(i, 1);
            }
        }
    }

    checkCollisions() {
        for (const obstacle of this.obstacles) {
            if (CollisionDetector.checkPlayerObstacle(this.player, obstacle, this.canvas)) {
                this.scoring.onCollision();
                this.setState(GameState.GAMEOVER);
                return;
            }
        }
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        ctx.clearRect(0, 0, width, height);
        if (this.currentScene) {
            this.currentScene.renderBackground(ctx, width, height);
        }
        for (const obstacle of this.obstacles) {
            obstacle.render(ctx);
        }
        this.renderPlayer(ctx);
        this.renderHUD(ctx);
        this.renderStateOverlay(ctx);
    }

    renderPlayer(ctx) {
        const x = this.player.x * this.canvas.width;
        const y = this.player.y * this.canvas.height;
        const radius = this.player.hitboxRadius * Math.min(this.canvas.width, this.canvas.height);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#00D9A5';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    renderHUD(ctx) {
        ctx.fillStyle = 'white';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`分数: ${Math.round(this.scoring.getCurrentScore())}`, 10, 25);
        ctx.fillText(`难度: ${this.difficulty.getCurrentLevel()}`, 10, 50);
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = Math.floor(this.gameTime % 60);
        ctx.fillText(`时间: ${minutes}:${seconds.toString().padStart(2, '0')}`, 10, 75);
    }

    renderStateOverlay(ctx) {
        if (this.state === GameState.MENU) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText('按开始游戏', this.canvas.width / 2, this.canvas.height / 2);
        } else if (this.state === GameState.GAMEOVER) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = '#EF4444';
            ctx.textAlign = 'center';
            ctx.font = 'bold 28px sans-serif';
            ctx.fillText('游戏结束', this.canvas.width / 2, this.canvas.height / 2 - 40);
            ctx.fillStyle = 'white';
            ctx.font = '20px sans-serif';
            ctx.fillText(`最终分数: ${Math.round(this.scoring.getFinalScore())}`, this.canvas.width / 2, this.canvas.height / 2);
            ctx.font = '24px sans-serif';
            ctx.fillText(`评级: ${this.scoring.getGrade()}`, this.canvas.width / 2, this.canvas.height / 2 + 35);
        }
    }

    setScene(scene) {
        if (this.currentScene) this.currentScene.cleanup();
        this.currentScene = scene;
        this.currentScene.init(this);
    }

    setMotionMode(mode) {
        this.input.setMotionMode(mode);
    }

    start() {
        this.setState(GameState.PLAYING);
    }

    cleanup() {
        this.stopGameLoop();
        if (this.currentScene) this.currentScene.cleanup();
    }
}

// ============================================================
// GAME UI - 游戏UI管理
// ============================================================
class GameUI {
    constructor(engine) {
        this.engine = engine;
        this.selectedScene = 'space';
        this.selectedMode = MotionMapper.MODES.SINGLE_YAW;
    }

    showSelectPanel() {
        const container = document.getElementById('game-container');
        if (!container) return;

        const existing = document.getElementById('game-select-panel');
        if (existing) { existing.style.display = 'block'; return; }

        const panel = document.createElement('div');
        panel.id = 'game-select-panel';
        panel.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(15,23,42,0.98);border:2px solid #00D9A5;border-radius:16px;padding:24px;min-width:340px;color:white;z-index:100;';

        panel.innerHTML = `
            <h3 style="text-align:center;margin-bottom:16px;color:#00D9A5;">选择游戏</h3>
            <div style="margin-bottom:14px;">
                <label style="display:block;margin-bottom:6px;color:#9CA3AF;font-size:12px;">场景</label>
                <div style="display:flex;gap:8px;">
                    <button class="scene-btn active" data-scene="space" style="flex:1;padding:10px;border:2px solid transparent;border-radius:6px;background:#1E293B;color:white;cursor:pointer;">🚀 太空</button>
                    <button class="scene-btn" data-scene="road" style="flex:1;padding:10px;border:2px solid transparent;border-radius:6px;background:#1E293B;color:white;cursor:pointer;">🛣️ 公路</button>
                    <button class="scene-btn" data-scene="ball" style="flex:1;padding:10px;border:2px solid transparent;border-radius:6px;background:#1E293B;color:white;cursor:pointer;">⚽ 接球</button>
                </div>
            </div>
            <div style="margin-bottom:14px;">
                <label style="display:block;margin-bottom:6px;color:#9CA3AF;font-size:12px;">运动模式</label>
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <button class="mode-btn active" data-mode="single_yaw" style="padding:8px;border:2px solid transparent;border-radius:4px;background:#1E293B;color:white;cursor:pointer;text-align:left;">单轴 - 左右转头</button>
                    <button class="mode-btn" data-mode="single_pitch" style="padding:8px;border:2px solid transparent;border-radius:4px;background:#1E293B;color:white;cursor:pointer;text-align:left;">单轴 - 上下点头</button>
                    <button class="mode-btn" data-mode="single_roll" style="padding:8px;border:2px solid transparent;border-radius:4px;background:#1E293B;color:white;cursor:pointer;text-align:left;">单轴 - 侧倾</button>
                    <button class="mode-btn" data-mode="dual_pitch_yaw" style="padding:8px;border:2px solid transparent;border-radius:4px;background:#1E293B;color:white;cursor:pointer;text-align:left;">双轴 - 上下+左右</button>
                    <button class="mode-btn" data-mode="triple" style="padding:8px;border:2px solid transparent;border-radius:4px;background:#1E293B;color:white;cursor:pointer;text-align:left;">三轴 - 综合</button>
                </div>
            </div>
            <button id="start-game-btn" style="width:100%;padding:12px;background:#00D9A5;border:none;border-radius:6px;color:#0F172A;font-size:14px;font-weight:bold;cursor:pointer;">开始游戏</button>
        `;

        container.appendChild(panel);
        this.bindEvents(panel);
    }

    hideSelectPanel() {
        const panel = document.getElementById('game-select-panel');
        if (panel) panel.style.display = 'none';
    }

    bindEvents(panel) {
        panel.querySelectorAll('.scene-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.scene-btn').forEach(b => { b.classList.remove('active'); b.style.borderColor = 'transparent'; });
                btn.classList.add('active');
                btn.style.borderColor = '#00D9A5';
                this.selectedScene = btn.dataset.scene;
            });
        });

        panel.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.mode-btn').forEach(b => { b.classList.remove('active'); b.style.borderColor = 'transparent'; });
                btn.classList.add('active');
                btn.style.borderColor = '#00D9A5';
                this.selectedMode = btn.dataset.mode;
            });
        });

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startGame());
        }
    }

    startGame() {
        this.hideSelectPanel();
        this.engine.setMotionMode(this.selectedMode);

        let scene;
        switch (this.selectedScene) {
            case 'space': scene = new SceneSpace(); break;
            case 'road': scene = new SceneRoad(); break;
            case 'ball': scene = new SceneBall(); break;
            default: scene = new SceneSpace();
        }

        this.engine.setScene(scene);
        this.engine.start();
    }
}

// ============================================================
// EXPORT
// ============================================================
window.GameModule = {
    GameEngine,
    GameUI,
    MotionMapper,
    GameState
};
