// 四种循环生态定义：城市 / 湖边 / 山谷 / 沙漠
// 路面色原则：中灰偏亮，保证远处深色障碍物/车辆对比清晰
export const BIOMES = [
  {
    id: 'city',
    name: '城市',
    roadTint: 0x848a92,        // 中灰蓝沥青（提亮，车辆/障碍物清晰可见）
    sidewalkColor: 0x9aa0a6,
    skyHorizon: 0xaec9e0,
    skyZenith: 0x5a8ac8,
    skyGround: 0x6a7a8a,
    fogColor: 0xaec9e0,
    fogNear: 60,
    fogFar: 280,
    ambientColor: 0xffffff,
    ambientIntensity: 0.6,
    cloudOpacity: 0.85,
    sceneryType: 'buildings',
  },
  {
    id: 'lakeside',
    name: '湖边',
    roadTint: 0x7e7e74,
    sidewalkColor: 0x8a9a7a,
    skyHorizon: 0xc8ddf0,
    skyZenith: 0x6aaade,
    skyGround: 0x4a6a8a,
    fogColor: 0xb8d8e8,
    fogNear: 70,
    fogFar: 300,
    ambientColor: 0xddeeff,
    ambientIntensity: 0.65,
    cloudOpacity: 0.75,
    sceneryType: 'lakeside',
  },
  {
    id: 'valley',
    name: '山谷',
    roadTint: 0x6e726e,
    sidewalkColor: 0x7a8a6a,
    skyHorizon: 0xb8d8a8,
    skyZenith: 0x4a8ab8,
    skyGround: 0x3a5a3a,
    fogColor: 0xa8c898,
    fogNear: 80,
    fogFar: 340,
    ambientColor: 0xddffdd,
    ambientIntensity: 0.55,
    cloudOpacity: 0.6,
    sceneryType: 'valley',
  },
  {
    id: 'desert',
    name: '沙漠',
    roadTint: 0x7a7466,        // 灰调沥青，与沙地（0xd8b878）拉开明度差
    sidewalkColor: 0xc8a86a,
    skyHorizon: 0xe8c8a0,
    skyZenith: 0xc8a060,
    skyGround: 0x8a6a3a,
    fogColor: 0xd8b888,
    fogNear: 50,
    fogFar: 240,               // 热雾保留但不过浓，远处障碍物仍可见
    ambientColor: 0xffeedd,
    ambientIntensity: 0.7,
    cloudOpacity: 0.4,
    sceneryType: 'desert',
  },
];

export const BIOME_LENGTH = 400;      // 每段生态长度（米）
export const TRANSITION_LENGTH = 80;  // 过渡混合长度（米）
