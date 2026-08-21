// BLE 陀螺仪接入（WitMotion 系 IMU，协议与主游戏一致）
// 帧格式：0x55 帧头 + 20 字节帧；角度帧 type=0x3D(61)/0x71(113)，int16 LE / 32768 * 180
//   yaw   = -(0x3D: I16@6 / 0x71: I16@8)  （取负 + 跨 ±180° 连续化）
//   pitch = -(I16@4)
//   roll  =  (0x3D: I16@2 / 0x71: I16@6)
// 单帧跳变 >60° 拒绝（毛刺过滤）；解锁指令 [FF AA 69 88 B5]

const BLE_SERVICES = [
  '0000ffe5-0000-1000-8000-00805f9a34fb',
  '0000ffe0-0000-1000-8000-00805f9a34fb',
];
const UNLOCK_CMD = new Uint8Array([0xFF, 0xAA, 0x69, 0x88, 0xB5]);
const GIANT_STEP_DEG = 60;

// 纯函数帧解析器（可单测）：feed(chunk) 增量喂字节，解出的角度帧回调 onPose
export function createFrameParser(onPose) {
  let buf = new Uint8Array(0);
  let lastYaw = null;                    // 连续化后的上一帧 yaw
  let last = null;                       // 上一帧已接受的 {yaw,pitch,roll}
  const stats = { angleFrames: 0, rejected: 0, otherFrames: 0 };

  return {
    stats,
    feed(chunk) {
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf); merged.set(chunk, buf.length);
      buf = merged;
      let i = 0;
      while (i < buf.length) {
        if (buf[i] !== 0x55) { i++; continue; }
        if (i + 20 > buf.length) break;             // 半帧，等下次
        const type = buf[i + 1];
        const dv = new DataView(buf.buffer, buf.byteOffset + i);
        if (type === 61 || type === 113) {          // 角度帧
          const s = 32768 / 180;
          const yawRaw = -(type === 61 ? dv.getInt16(6, true) : dv.getInt16(8, true)) / s;
          const pitch = -dv.getInt16(4, true) / s;
          const roll = (type === 61 ? dv.getInt16(2, true) : dv.getInt16(6, true)) / s;
          // yaw 跨 ±180° 连续化
          let yaw = yawRaw;
          if (lastYaw !== null) {
            let d = yaw - lastYaw;
            if (d > 180) d -= 360;
            if (d < -180) d += 360;
            yaw = lastYaw + d;
          }
          // 毛刺拒绝：单帧跳变 >60°
          if (last && (Math.abs(yaw - last.yaw) > GIANT_STEP_DEG
                    || Math.abs(pitch - last.pitch) > GIANT_STEP_DEG)) {
            stats.rejected++;
          } else {
            last = { yaw, pitch, roll };
            onPose(last);
          }
          lastYaw = yaw;
          stats.angleFrames++;
        } else {
          stats.otherFrames++;
        }
        i += 20;
      }
      buf = buf.slice(i);
    },
    reset() { buf = new Uint8Array(0); lastYaw = null; last = null; },
  };
}

export class BleImuSource {
  constructor(onPose, onStatus = () => {}) {
    this.parser = createFrameParser(onPose);
    this.onStatus = onStatus;
    this.device = null;
    this.writeChar = null;
    this.connected = false;
    this._onData = (e) => {
      this.parser.feed(new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength));
      // 收到帧但一直没有角度帧：补发解锁指令（移植自主包的兜底逻辑）
      if (this.parser.stats.angleFrames === 0 && this.parser.stats.otherFrames >= 20 && this.writeChar) {
        this.writeChar.writeValue(UNLOCK_CMD).catch(() => {});
      }
    };
    this._onDisconnect = () => {
      this.connected = false;
      this.onStatus('已断开');
    };
  }

  async connect() {
    if (!navigator.bluetooth) throw new Error('当前浏览器不支持 Web Bluetooth（请用 Chrome/Edge，且页面需 HTTPS 或 localhost）');
    this.onStatus('搜索设备…');
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_SERVICES,
    });
    if (!this.device.gatt) throw new Error('设备不支持 GATT');
    this.device.addEventListener('gattserverdisconnected', this._onDisconnect);
    this.onStatus(`连接 ${this.device.name || '未知设备'}…`);
    const server = await this.device.gatt.connect();
    await new Promise(r => setTimeout(r, 600));

    // 在候选服务里找通知特征 + 写入特征
    let notifyChar = null;
    for (const suuid of BLE_SERVICES) {
      try {
        const svc = await server.getPrimaryService(suuid);
        const chars = await svc.getCharacteristics();
        for (const c of chars) {
          if (!notifyChar && c.properties.notify) notifyChar = c;
          if (!this.writeChar && (c.properties.write || c.properties.writeWithoutResponse)) this.writeChar = c;
        }
        if (notifyChar) break;
      } catch { /* 该服务不存在，试下一个 */ }
    }
    if (!notifyChar) throw new Error('未找到 IMU 数据通知特征（ffe5/ffe0 服务均不可用）');

    await notifyChar.startNotifications();
    notifyChar.addEventListener('characteristicvaluechanged', this._onData);
    if (this.writeChar) {
      await this.writeChar.writeValue(UNLOCK_CMD).catch(() => {});
    }
    this.connected = true;
    this.onStatus(`已连接: ${this.device.name || '未知设备'}`);
    return true;
  }

  disconnect() {
    try { this.device?.gatt?.disconnect(); } catch { /* ignore */ }
    this.connected = false;
  }
}
