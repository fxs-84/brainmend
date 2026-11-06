import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/0007_gait_video_uploads.sql', import.meta.url), 'utf8');

test('扫码视频使用私有存储桶和一次性短期会话', () => {
  assert.match(sql, /gait-video-uploads/);
  assert.match(sql, /public\s*=\s*false/i);
  assert.match(sql, /gait_video_upload_sessions/);
  assert.match(sql, /expires_at/);
  assert.match(sql, /upload_token/);
});

test('令牌生成不依赖 pgcrypto 扩展，避免环境未启用时失败', () => {
  assert.doesNotMatch(sql, /gen_random_bytes/);
  assert.match(sql, /gen_random_uuid/);
});

test('上传、下载、完成和清理都需要服务端会话校验', () => {
  for (const name of [
    'create_gait_video_upload_session',
    'prepare_gait_video_upload',
    'complete_gait_video_upload',
    'get_gait_video_upload_session',
    'consume_gait_video_upload',
    'cleanup_gait_video_uploads'
  ]) assert.ok(sql.includes(name), name);
  assert.match(sql, /storage\.objects/);
  assert.match(sql, /can_access_gait_video_upload/);
  assert.match(sql, /sha256/);
});
