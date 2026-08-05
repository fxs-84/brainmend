// 生态循环管理器：随里程自动切换城市/湖边/山谷/沙漠
import * as THREE from 'three';
import { BIOMES, BIOME_LENGTH, TRANSITION_LENGTH } from './biome-definitions.js';
import { buildScenery } from './scenery-factory.js';

export class BiomeManager {
  constructor({ road, sky, buildings, scene }) {
    this.road = road;
    this.sky = sky;
    this.buildings = buildings;
    this.scene = scene;

    this.ambient = null;
    this.scene.traverse(n => { if (n.isAmbientLight) this.ambient = n; });

    // 预构建所有非城市生态景观
    this.sceneryGroups = {};
    this.sceneryUpdaters = {};
    for (const b of BIOMES) {
      if (b.sceneryType === 'buildings') continue;
      const s = buildScenery(b.sceneryType);
      if (!s) continue;
      s.group.visible = false;
      scene.add(s.group);
      this.sceneryGroups[b.id] = s.group;
      this.sceneryUpdaters[b.id] = s.update;
    }

    // 当前生态索引
    this.currentIdx = 0;
    this._applyBiome(0, 1);
  }

  // 重开一局：回到城市生态，清除过渡残留
  reset() {
    this.currentIdx = 0;
    this._applyBiome(0, 1);
  }

  update(worldZ) {
    const dist = Math.abs(worldZ);
    const biomeIdx = Math.floor(dist / BIOME_LENGTH) % BIOMES.length;
    const distInBiome = dist % BIOME_LENGTH;
    const transStart = BIOME_LENGTH - TRANSITION_LENGTH;

    // 正常段：确保当前生态完全应用
    if (biomeIdx !== this.currentIdx && distInBiome < transStart) {
      this._commitBiome(biomeIdx);
    }

    // 过渡段
    if (distInBiome >= transStart) {
      const nextIdx = (biomeIdx + 1) % BIOMES.length;
      const t = (distInBiome - transStart) / TRANSITION_LENGTH;
      this._lerpBiomes(biomeIdx, nextIdx, t);
    }

    // 更新所有景观的 z 位置
    const z = worldZ;
    this.buildings.update(z);
    for (const id of Object.keys(this.sceneryUpdaters)) {
      this.sceneryUpdaters[id](z);
    }
  }

  _commitBiome(idx) {
    this.currentIdx = idx;
    this._applyBiome(idx, 1);
  }

  _applyBiome(idx, opacity) {
    const b = BIOMES[idx];
    // 道路/路缘颜色
    this.road.setTint(b.roadTint, b.sidewalkColor);
    // 天空
    this.sky.setColors(b.skyHorizon, b.skyZenith, b.skyGround, b.cloudOpacity * opacity);
    // 雾 + 背景
    if (this.scene.fog) {
      this.scene.fog.color.setHex(b.fogColor);
      this.scene.fog.near = b.fogNear;
      this.scene.fog.far = b.fogFar;
    }
    this.scene.background.setHex(b.fogColor);
    // 环境光
    if (this.ambient) {
      this.ambient.color.setHex(b.ambientColor);
      this.ambient.intensity = b.ambientIntensity;
    }
    // 景观可见性
    for (const b2 of BIOMES) {
      if (b2.sceneryType === 'buildings') {
        this.buildings.group.visible = (b2.id === b.id);
      } else if (this.sceneryGroups[b2.id]) {
        this.sceneryGroups[b2.id].visible = (b2.id === b.id);
        this._setOpacity(this.sceneryGroups[b2.id], opacity);
      }
    }
  }

  _lerpBiomes(fromIdx, toIdx, t) {
    const from = BIOMES[fromIdx];
    const to = BIOMES[toIdx];

    // 道路颜色
    this.road.setTint(
      new THREE.Color(from.roadTint).lerp(new THREE.Color(to.roadTint), t).getHex(),
      new THREE.Color(from.sidewalkColor).lerp(new THREE.Color(to.sidewalkColor), t).getHex()
    );

    // 天空
    this.sky.setColors(
      new THREE.Color(from.skyHorizon).lerp(new THREE.Color(to.skyHorizon), t).getHex(),
      new THREE.Color(from.skyZenith).lerp(new THREE.Color(to.skyZenith), t).getHex(),
      new THREE.Color(from.skyGround).lerp(new THREE.Color(to.skyGround), t).getHex(),
      THREE.MathUtils.lerp(from.cloudOpacity, to.cloudOpacity, t)
    );

    // 雾
    if (this.scene.fog) {
      this.scene.fog.color.lerpColors(new THREE.Color(from.fogColor), new THREE.Color(to.fogColor), t);
      this.scene.fog.near = THREE.MathUtils.lerp(from.fogNear, to.fogNear, t);
      this.scene.fog.far = THREE.MathUtils.lerp(from.fogFar, to.fogFar, t);
    }
    this.scene.background.lerpColors(new THREE.Color(from.fogColor), new THREE.Color(to.fogColor), t);

    // 环境光
    if (this.ambient) {
      this.ambient.color.lerpColors(new THREE.Color(from.ambientColor), new THREE.Color(to.ambientColor), t);
      this.ambient.intensity = THREE.MathUtils.lerp(from.ambientIntensity, to.ambientIntensity, t);
    }

    // 景观淡入淡出
    for (const b of BIOMES) {
      if (b.sceneryType === 'buildings') {
        this.buildings.group.visible = (b.id === from.id || b.id === to.id);
        this._setOpacity(this.buildings.group, b.id === from.id ? 1 - t : t);
      } else if (this.sceneryGroups[b.id]) {
        this.sceneryGroups[b.id].visible = (b.id === from.id || b.id === to.id);
        this._setOpacity(this.sceneryGroups[b.id], b.id === from.id ? 1 - t : t);
      }
    }
  }

  _setOpacity(group, opacity) {
    group.traverse(n => {
      if (n.isMesh && n.material) {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        mats.forEach(m => {
          m.transparent = true;
          m.opacity = opacity;
        });
      }
    });
  }
}
