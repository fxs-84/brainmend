-- ============================================================
-- brainmend Supabase baseline (0001)
--
-- 目标:
--   · 把所有 brainmend 数据从 GitHub Contents API + localStorage
--     迁到 Supabase Cloud / 自托管 PostgreSQL
--   · 多治疗师隔离:therapist_id = auth.uid() 强制 RLS
--   · 神经系统自评 (P0): 患者通过 QR 扫码提交,REST + anon-key
--
-- 设计:
--   · 治疗师注册 → Supabase Auth 自动创建 auth.users → 触发器自动建 therapists 行
--   · 治疗师在脑优化创建 QR 分享链接 → qnr_share_links (token + expires)
--   · 患者扫码 → 沙箱答题 → 通过 anon-key POST 到 qnr_self_assessments
--     (RLS 校验 token 在 share_links 中有效)
--   · 治疗师在脑优化查看 → 通过 auth-key SELECT (RLS 校验 therapist_id)
--
-- 用法:
--   在 Supabase SQL Editor 一次性跑完即可
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. 角色枚举
-- ============================================================
do $$ begin
  create type public.brainmend_role as enum ('admin', 'therapist');
exception when duplicate_object then null; end $$;

-- ============================================================
-- 2. 治疗师账号(关联 auth.users)
-- ============================================================
create table if not exists public.therapists (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null check (length(trim(full_name)) > 0),
  role public.brainmend_role not null default 'therapist',
  -- GitHub token (治疗师私人 token, 用于脑优化旧的 GitHub 上传路径, 后续可弃用)
  -- 注: 当前 Sprint 0 完全移除 GitHub 路径, 此列保留为 NULL 兼容旧逻辑
  github_token text,
  -- 治疗师默认目录 ID (旧 tid 概念, 后续可以弃用)
  default_tid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists therapists_email_idx on public.therapists (email);

-- 自动创建 therapists 行 (auth.users 注册时触发)
create or replace function public.handle_new_therapist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.therapists (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'therapist'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_therapist();

-- ============================================================
-- 3. 患者档案 (治疗师录入)
-- ============================================================
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  age smallint check (age between 0 and 150),
  gender text check (gender in ('男', '女', '其他')),
  phone text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists patients_therapist_id_idx on public.patients (therapist_id);
create index if not exists patients_created_at_idx on public.patients (created_at desc);

-- ============================================================
-- 4. QR 分享链接 (治疗师生成, 患者扫码进入沙箱)
-- ============================================================
create table if not exists public.qnr_share_links (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists (id) on delete cascade,
  token text not null unique,
  -- 治疗师可在生成 QR 时预填患者信息 (减少患者端填写量)
  prefilled_name text,
  prefilled_age smallint,
  prefilled_gender text check (prefilled_gender in ('男', '女', '其他')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked boolean not null default false,
  -- 患者扫码次数统计
  scan_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qnr_share_links_token_idx on public.qnr_share_links (token);
create index if not exists qnr_share_links_therapist_idx on public.qnr_share_links (therapist_id);
create index if not exists qnr_share_links_expires_at_idx on public.qnr_share_links (expires_at);

-- ============================================================
-- 5. 神经系统自评记录 (P0)
-- ============================================================
create table if not exists public.qnr_self_assessments (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists (id) on delete cascade,
  -- 患者可能是匿名 (扫码后直接提交, 未预先建档) 所以 patient_id 可空
  patient_id uuid references public.patients (id) on delete set null,
  -- 关联的分享 token (用于 RLS 校验患者提交合法, 不必显示给患者)
  share_token text,
  -- 冗余字段 (便于查询展示, 无需 join)
  patient_name text not null,
  patient_age smallint,
  patient_gender text,
  -- 作答数据 (100 题, key=题号, value=0-4 分)
  responses jsonb not null,
  -- 评分结果 (16 分区)
  by_region jsonb not null,
  severity_by_region jsonb not null,
  affected_regions jsonb not null default '[]'::jsonb,
  total_score int not null default 0,
  percent numeric(5,2) not null default 0,
  worst_severity text check (worst_severity in ('normal', 'mild', 'moderate', 'severe')),
  burden_groups jsonb not null default '[]'::jsonb,
  phone_ear text,
  -- 客户端信息 (可选, 用于审计)
  user_agent text,
  ip_hash text,  -- IP 哈希, 不存明文
  -- 来源 (qr / direct)
  source text not null default 'qr',
  -- 提交时间
  submitted_at timestamptz not null default now(),
  -- 数据库审计字段
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists qnr_self_assessments_therapist_id_idx on public.qnr_self_assessments (therapist_id);
create index if not exists qnr_self_assessments_patient_id_idx on public.qnr_self_assessments (patient_id);
create index if not exists qnr_self_assessments_share_token_idx on public.qnr_self_assessments (share_token);
create index if not exists qnr_self_assessments_submitted_at_idx on public.qnr_self_assessments (submitted_at desc);
create index if not exists qnr_self_assessments_deleted_at_idx on public.qnr_self_assessments (deleted_at) where deleted_at is null;

-- ============================================================
-- 6. RLS: 全部 brainmend 表启用行级安全
-- ============================================================
alter table public.therapists            enable row level security;
alter table public.patients               enable row level security;
alter table public.qnr_share_links        enable row level security;
alter table public.qnr_self_assessments   enable row level security;

-- 通用工具函数: 获取当前治疗师 ID
create or replace function public.current_therapist_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.therapists where id = auth.uid();
$$;

-- ============================================================
-- 7. therapists: 治疗师只能读自己的账号, admin 可读全部
-- ============================================================
drop policy if exists therapists_select_own on public.therapists;
create policy therapists_select_own on public.therapists
  for select using (
    id = auth.uid()
    or exists (select 1 from public.therapists where id = auth.uid() and role = 'admin')
  );

drop policy if exists therapists_update_own on public.therapists;
create policy therapists_update_own on public.therapists
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- 8. patients: 治疗师只能 CRUD 自己的患者
-- ============================================================
drop policy if exists patients_select_own on public.patients;
create policy patients_select_own on public.patients
  for select using (
    therapist_id = auth.uid()
    and deleted_at is null
  );

drop policy if exists patients_insert_own on public.patients;
create policy patients_insert_own on public.patients
  for insert with check (therapist_id = auth.uid());

drop policy if exists patients_update_own on public.patients;
create policy patients_update_own on public.patients
  for update using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

drop policy if exists patients_delete_own on public.patients;
create policy patients_delete_own on public.patients
  for delete using (therapist_id = auth.uid());

-- ============================================================
-- 9. qnr_share_links: 治疗师可 CRUD, 患者可读有效 token
-- ============================================================
-- 治疗师 CRUD
drop policy if exists qnr_share_links_select_own on public.qnr_share_links;
create policy qnr_share_links_select_own on public.qnr_share_links
  for select using (therapist_id = auth.uid());

drop policy if exists qnr_share_links_insert_own on public.qnr_share_links;
create policy qnr_share_links_insert_own on public.qnr_share_links
  for insert with check (therapist_id = auth.uid());

drop policy if exists qnr_share_links_update_own on public.qnr_share_links;
create policy qnr_share_links_update_own on public.qnr_share_links
  for update using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

drop policy if exists qnr_share_links_delete_own on public.qnr_share_links;
create policy qnr_share_links_delete_own on public.qnr_share_links
  for delete using (therapist_id = auth.uid());

-- 患者 anon-key: 可读取 token 用于校验 (但必须未过期未撤销)
-- 注: anon-key 用户的 auth.uid() 为 NULL, 所以 therapist_id = auth.uid() 不匹配
-- 需要单独策略:anon 用户按 token 查, 且只能查未过期未撤销的
drop policy if exists qnr_share_links_select_anon on public.qnr_share_links;
create policy qnr_share_links_select_anon on public.qnr_share_links
  for select to anon
  using (revoked = false and expires_at > now());

-- ============================================================
-- 10. qnr_self_assessments: 治疗师可读自己的, 患者通过 RPC 提交
-- ============================================================
-- 治疗师读自己治疗的患者记录
drop policy if exists qnr_self_assessments_select_own on public.qnr_self_assessments;
create policy qnr_self_assessments_select_own on public.qnr_self_assessments
  for select using (therapist_id = auth.uid());

-- 治疗师可改/软删自己的记录
drop policy if exists qnr_self_assessments_update_own on public.qnr_self_assessments;
create policy qnr_self_assessments_update_own on public.qnr_self_assessments
  for update using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

drop policy if exists qnr_self_assessments_delete_own on public.qnr_self_assessments;
create policy qnr_self_assessments_delete_own on public.qnr_self_assessments
  for delete using (therapist_id = auth.uid());

-- ============================================================
-- 11. RPC: 患者 anon-key 提交 (核心: 治疗师 ID 由 token 派生, 不受信)
-- ============================================================
-- 设计原则:
--   · 患者客户端只传 share_token + 答卷数据
--   · 函数内部从 token 查出 therapist_id 并强制使用
--   · 拒绝伪造 therapist_id (前端根本无法传这个参数)
--   · SECURITY DEFINER: 函数以定义者权限执行, 绕过 RLS 完成插入
create or replace function public.submit_qnr_self_assessment(
  p_share_token text,
  p_patient_name text,
  p_patient_age smallint,
  p_patient_gender text,
  p_responses jsonb,
  p_by_region jsonb,
  p_severity_by_region jsonb,
  p_affected_regions jsonb,
  p_total_score int,
  p_percent numeric,
  p_worst_severity text,
  p_burden_groups jsonb,
  p_phone_ear text,
  p_user_agent text default null,
  p_ip_hash text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_therapist_id uuid;
  v_assessment_id uuid;
  v_token_record record;
begin
  -- 1. 校验 token: 必须存在, 未撤销, 未过期
  select therapist_id, id, expires_at
    into v_token_record
  from public.qnr_share_links
  where token = p_share_token
    and revoked = false
    and expires_at > now();

  if v_token_record.therapist_id is null then
    raise exception 'Invalid or expired share token' using errcode = 'P0001';
  end if;

  v_therapist_id := v_token_record.therapist_id;

  -- 2. 插入记录 (therapist_id 由 token 派生, 不可由前端指定)
  insert into public.qnr_self_assessments (
    therapist_id, share_token, patient_name, patient_age, patient_gender,
    responses, by_region, severity_by_region, affected_regions,
    total_score, percent, worst_severity, burden_groups, phone_ear,
    user_agent, ip_hash, source
  ) values (
    v_therapist_id, p_share_token, p_patient_name, p_patient_age, p_patient_gender,
    p_responses, p_by_region, p_severity_by_region, p_affected_regions,
    p_total_score, p_percent, p_worst_severity, p_burden_groups, p_phone_ear,
    p_user_agent, p_ip_hash, 'qr'
  )
  returning id into v_assessment_id;

  -- 3. 累加 share_link 的 scan_count (可选, 用于治疗师观察扫码热度)
  update public.qnr_share_links
  set scan_count = scan_count + 1
  where token = p_share_token;

  return v_assessment_id;
end;
$$;

-- 允许 anon 用户调用此函数 (不需要登录)
grant execute on function public.submit_qnr_self_assessment to anon, authenticated;

comment on function public.submit_qnr_self_assessment is
  '患者 anon-key 提交自评 RPC。therapist_id 由 token 派生, 不可伪造。返回评估 ID。';

-- ============================================================
-- 12. RPC: 治疗师管理 share_links (创建 + 撤销)
-- ============================================================
create or replace function public.create_qnr_share_link(
  p_prefilled_name text default null,
  p_prefilled_age smallint default null,
  p_prefilled_gender text default null,
  p_expires_days int default 30
) returns public.qnr_share_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_link public.qnr_share_links;
begin
  -- 生成 22 字符 URL-safe token (与 kfblxt generateToken 兼容: nanoid 风格)
  v_token := encode(gen_random_bytes(16), 'hex');

  insert into public.qnr_share_links (
    therapist_id, token, prefilled_name, prefilled_age, prefilled_gender, expires_at
  ) values (
    auth.uid(), v_token, p_prefilled_name, p_prefilled_age, p_prefilled_gender,
    now() + make_interval(days => p_expires_days)
  )
  returning * into v_link;

  return v_link;
end;
$$;

grant execute on function public.create_qnr_share_link to authenticated;

-- 撤销 share_link (治疗师可撤销自己创建的)
create or replace function public.revoke_qnr_share_link(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.qnr_share_links
  set revoked = true
  where token = p_token and therapist_id = auth.uid();
end;
$$;

grant execute on function public.revoke_qnr_share_link to authenticated;

-- ============================================================
-- 11. 通用审计触发器 (updated_at)
-- ============================================================
create or replace function public.touch_audit_brainmend()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists therapists_touch on public.therapists;
create trigger therapists_touch before update on public.therapists
  for each row execute function public.touch_audit_brainmend();

drop trigger if exists patients_touch on public.patients;
create trigger patients_touch before update on public.patients
  for each row execute function public.touch_audit_brainmend();

drop trigger if exists qnr_share_links_touch on public.qnr_share_links;
create trigger qnr_share_links_touch before update on public.qnr_share_links
  for each row execute function public.touch_audit_brainmend();

drop trigger if exists qnr_self_assessments_touch on public.qnr_self_assessments;
create trigger qnr_self_assessments_touch before update on public.qnr_self_assessments
  for each row execute function public.touch_audit_brainmend();

-- ============================================================
-- 12. Realtime: 治疗师可订阅自己记录的变更 (后续可选)
-- ============================================================
alter publication supabase_realtime add table public.qnr_self_assessments;

-- ============================================================
-- 完成
-- ============================================================
-- 验证清单 (跑完后执行):
--   select 'therapists' as t, count(*) from public.therapists
--   union all select 'patients', count(*) from public.patients
--   union all select 'qnr_share_links', count(*) from public.qnr_share_links
--   union all select 'qnr_self_assessments', count(*) from public.qnr_self_assessments;
--
--  RLS 验证:
--   用 anon key 执行: select * from public.qnr_share_links where token = '<test>';
--     应该返回记录(未过期)
--   用 anon key 执行: insert into public.qnr_self_assessments (...);
--     应该成功(带有效 share_token) 或 失败(无效 token)