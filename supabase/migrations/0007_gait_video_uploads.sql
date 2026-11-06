-- 手机扫码上传步态原视频：一次性会话 + 私有临时存储。
-- 在 Supabase SQL Editor 执行。桶和函数可重复创建，策略会先删除再建立。

create table if not exists public.gait_video_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  upload_token text not null unique,
  side text not null check (side in ('left', 'right')),
  status text not null default 'waiting' check (status in ('waiting', 'uploading', 'ready', 'consumed', 'expired')),
  object_path text,
  file_name text,
  content_type text,
  file_size bigint,
  sha256 text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  ready_at timestamptz,
  consumed_at timestamptz
);

create index if not exists gait_video_upload_sessions_expires_idx
  on public.gait_video_upload_sessions (expires_at);
alter table public.gait_video_upload_sessions enable row level security;
-- 不添加表级公开策略。所有访问都通过下列 security definer 函数。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gait-video-uploads',
  'gait-video-uploads',
  false,
  524288000,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/mov', 'application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.gait_video_session(
  p_session_id uuid,
  p_upload_token text
) returns public.gait_video_upload_sessions
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.gait_video_upload_sessions;
begin
  select * into v_session
  from public.gait_video_upload_sessions
  where id = p_session_id and upload_token = p_upload_token;
  if not found or v_session.expires_at <= now() or v_session.status = 'expired' then
    raise exception '上传会话不存在或已过期';
  end if;
  return v_session;
end;
$$;
revoke all on function public.gait_video_session(uuid, text) from public, anon, authenticated;

create or replace function public.can_access_gait_video_upload(
  p_session_id text,
  p_upload_token text
) returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1 from public.gait_video_upload_sessions
    where id::text = p_session_id
      and upload_token = p_upload_token
      and status in ('waiting', 'uploading', 'ready')
      and expires_at > now()
  );
exception when others then
  return false;
end;
$$;
grant execute on function public.can_access_gait_video_upload(text, text) to anon, authenticated;

create or replace function public.create_gait_video_upload_session(
  p_side text
) returns table(session_id uuid, upload_token text, expires_at timestamptz)
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_side not in ('left', 'right') then
    raise exception '视频侧别无效';
  end if;
  insert into public.gait_video_upload_sessions (side, upload_token)
  values (p_side, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  returning id, public.gait_video_upload_sessions.upload_token, public.gait_video_upload_sessions.expires_at
  into session_id, upload_token, expires_at;
  return next;
end;
$$;
grant execute on function public.create_gait_video_upload_session(text) to anon, authenticated;

create or replace function public.prepare_gait_video_upload(
  p_session_id uuid,
  p_upload_token text,
  p_file_name text,
  p_content_type text,
  p_file_size bigint,
  p_sha256 text
) returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.gait_video_upload_sessions;
  v_path text;
begin
  v_session := public.gait_video_session(p_session_id, p_upload_token);
  if v_session.status not in ('waiting', 'uploading') then
    raise exception '当前会话不能继续上传';
  end if;
  if p_file_size is null or p_file_size < 1 or p_file_size > 524288000 then
    raise exception '视频大小必须在 1 字节到 500 MB 之间';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception '文件 SHA-256 校验值无效';
  end if;
  v_path := p_session_id::text || '/' || p_upload_token || '/source';
  update public.gait_video_upload_sessions
  set status = 'uploading', object_path = v_path,
      file_name = left(coalesce(p_file_name, 'video.mp4'), 240),
      content_type = left(coalesce(nullif(p_content_type, ''), 'application/octet-stream'), 120),
      file_size = p_file_size, sha256 = lower(p_sha256)
  where id = p_session_id;
  return v_path;
end;
$$;
grant execute on function public.prepare_gait_video_upload(uuid, text, text, text, bigint, text) to anon, authenticated;

create or replace function public.complete_gait_video_upload(
  p_session_id uuid,
  p_upload_token text,
  p_file_size bigint,
  p_sha256 text
) returns boolean
language plpgsql security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_session public.gait_video_upload_sessions;
begin
  v_session := public.gait_video_session(p_session_id, p_upload_token);
  if v_session.status != 'uploading' or v_session.object_path is null then
    raise exception '请先准备视频上传';
  end if;
  if v_session.file_size != p_file_size or v_session.sha256 != lower(p_sha256) then
    raise exception '上传前后的文件信息不一致';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'gait-video-uploads' and name = v_session.object_path
  ) then
    raise exception '云端尚未收到完整视频';
  end if;
  update public.gait_video_upload_sessions
  set status = 'ready', ready_at = now()
  where id = p_session_id;
  return true;
end;
$$;
grant execute on function public.complete_gait_video_upload(uuid, text, bigint, text) to anon, authenticated;

create or replace function public.get_gait_video_upload_session(
  p_session_id uuid,
  p_upload_token text
) returns table(
  status text,
  object_path text,
  file_name text,
  content_type text,
  file_size bigint,
  sha256 text,
  expires_at timestamptz
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.gait_video_upload_sessions;
begin
  v_session := public.gait_video_session(p_session_id, p_upload_token);
  status := v_session.status;
  object_path := v_session.object_path;
  file_name := v_session.file_name;
  content_type := v_session.content_type;
  file_size := v_session.file_size;
  sha256 := v_session.sha256;
  expires_at := v_session.expires_at;
  return next;
end;
$$;
grant execute on function public.get_gait_video_upload_session(uuid, text) to anon, authenticated;

create or replace function public.consume_gait_video_upload(
  p_session_id uuid,
  p_upload_token text
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.gait_video_upload_sessions;
begin
  v_session := public.gait_video_session(p_session_id, p_upload_token);
  if v_session.status != 'ready' then
    raise exception '视频尚未就绪或已被接收';
  end if;
  update public.gait_video_upload_sessions
  set status = 'consumed', consumed_at = now()
  where id = p_session_id;
  return true;
end;
$$;
grant execute on function public.consume_gait_video_upload(uuid, text) to anon, authenticated;

create or replace function public.cleanup_gait_video_uploads()
returns integer
language plpgsql security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_count integer;
begin
  delete from storage.objects
  where bucket_id = 'gait-video-uploads'
    and name in (
      select object_path from public.gait_video_upload_sessions
      where object_path is not null and expires_at <= now() and status != 'consumed'
    );
  update public.gait_video_upload_sessions
  set status = 'expired'
  where expires_at <= now() and status != 'consumed';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.cleanup_gait_video_uploads() from public, anon, authenticated;
grant execute on function public.cleanup_gait_video_uploads() to service_role;

-- 存储路径为 <session_uuid>/<random_token>/source。不可列出对象，只有持有完整密钥者可读写。
drop policy if exists gait_video_upload_insert on storage.objects;
create policy gait_video_upload_insert on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'gait-video-uploads'
  and public.can_access_gait_video_upload((storage.foldername(name))[1], (storage.foldername(name))[2])
);

drop policy if exists gait_video_upload_select on storage.objects;
create policy gait_video_upload_select on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'gait-video-uploads'
  and public.can_access_gait_video_upload((storage.foldername(name))[1], (storage.foldername(name))[2])
);

drop policy if exists gait_video_upload_update on storage.objects;
create policy gait_video_upload_update on storage.objects
for update to anon, authenticated
using (
  bucket_id = 'gait-video-uploads'
  and public.can_access_gait_video_upload((storage.foldername(name))[1], (storage.foldername(name))[2])
)
with check (
  bucket_id = 'gait-video-uploads'
  and public.can_access_gait_video_upload((storage.foldername(name))[1], (storage.foldername(name))[2])
);

drop policy if exists gait_video_upload_delete on storage.objects;
create policy gait_video_upload_delete on storage.objects
for delete to anon, authenticated
using (
  bucket_id = 'gait-video-uploads'
  and public.can_access_gait_video_upload((storage.foldername(name))[1], (storage.foldername(name))[2])
);
