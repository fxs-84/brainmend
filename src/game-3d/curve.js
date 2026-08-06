// 世界弯曲（OutRun 式弯道）：按元素离玩家的纵深叠加横向偏移
// 玩法坐标系保持直线（车道/碰撞/生成全部不变），只有渲染位置弯曲
//
// offsetAt(relZ): relZ 为元素相对玩家的 z（负值=前方）
//   前方 d 米处的横向偏移 = curveAmount × d² × K
//   玩家附近（|relZ| 小）偏移≈0，碰撞判定不受影响
const K = 0.0008;  // 弯曲强度：curve=1 时 100m 处偏移 8m

export const WorldCurve = {
  amount: 0,

  // 每帧根据里程更新弯度：两段正弦叠加，产生左右变化的自然弯道
  updateFromDistance(dist) {
    this.amount = Math.sin(dist * 0.004) * 1.0 + Math.sin(dist * 0.0011 + 1.7) * 0.6;
  },

  // 元素横向视觉偏移（relZ 负=前方；后方不偏移避免近处穿帮）
  offsetAt(relZ) {
    const d = -relZ;
    if (d <= 0) return 0;
    return this.amount * d * d * K;
  },
};
