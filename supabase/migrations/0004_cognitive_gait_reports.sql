-- ============================================================
-- brainmend Supabase 0004: 认知报告 + 步态报告上云
--
-- 目标:
--   · 认知报告 (12项/6项游戏) 和步态分析报告也进 Supabase
--   · 复用 qnr_share_links (加 kind 列区分 qnr/cognitive/gait)
--   · 新建 cognitive_assessments / gait_assessments 两张报告表
--   · 提交走 security definer RPC, therapist_id 由 token 派生 (不可伪造)
--
-- 用法:
--   在 Supabase SQL Editor 一次性跑完即可 (幂等, 可反复跑)
-- ============================================================

-- ============================================================
-- 1. qnr_share_links 加 kind 列 (qnr=自评 / cognitive=认知 / gait=步态)
-- ============================================================
alter table public.qnr_share_links
  add column if not exists kind text not null default 'qnr';

-- check 约束 (幂等: 先删再加)
alter table public.qnr_share_links
  drop constraint if exists qnr_share_links_kind_check;
alter table public.qnr_share_links
  add constraint qnr_share_links_kind_check
  check (kind in ('qnr', 'cognitive', 'gait'));

create index if not exists qnr_share_links_kind_idx on public.qnr_share_links (kind);

-- ============================================================
-- 2. 认知报告表
-- ============================================================
create table if not exists public.cognitive_assessments (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists (id) on delete cascade,
  share_token text,
  -- 冗余患者字段 (便于查询展示, 无需 join)
  patient_name text not null,
  patient_age smallint,
  patient_gender text,
  -- 完整认知报告 (normalizedScores/rawScores/brainRegions/riskIndex/overallScore/isQuick6 等)
  payload jsonb not null,
  -- 冗余查询字段
  overall_score numeric(6,2),
  is_quick6 boolean not null default false,
  -- 来源 (qr / direct)
  source text not null default 'qr',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists cognitive_assessments_therapist_id_idx on public.cognitive_assessments (therapist_id);
create index if not exists cognitive_assessments_share_token_idx on public.cognitive_assessments (share_token);
create index if not exists cognitive_assessments_submitted_at_idx on public.cognitive_assessments (submitted_at desc);
create index if not exists cognitive_assessments_deleted_at_idx on public.cognitive_assessments (deleted_at) where deleted_at is null;

-- ============================================================
-- 3. 步态报告表
-- ============================================================
create table if not exists public.gait_assessments (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists (id) on delete cascade,
  share_token text,
  patient_name text not null,
  patient_age smallint,
  patient_gender text,
  -- 完整步态报告 (parameters/asymmetries/classification/neuro/rehab 等; phaseSnapshots 截图较大, 前端提交前剥离)
  payload jsonb not null,
  -- 冗余查询字段
  classification_primary text,
  source text not null default 'qr',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists gait_assessments_therapist_id_idx on public.gait_assessments (therapist_id);
create index if not exists gait_assessments_share_token_idx on public.gait_assessments (share_token);
create index if not exists gait_assessments_submitted_at_idx on public.gait_assessments (submitted_at desc);
create index if not exists gait_assessments_deleted_at_idx on public.gait_assessments (deleted_at) where deleted_at is null;

-- ============================================================
-- 4. RLS
-- ============================================================
alter table public.cognitive_assessments enable row level security;
alter table public.gait_assessments      enable row level security;

-- 治疗师读/改/删自己的记录 (与 qnr_self_assessments 策略一致)
drop policy if exists cognitive_assessments_select_own on public.cognitive_assessments;
create policy cognitive_assessments_select_own on public.cognitive_assessments
  for select using (therapist_id = auth.uid());

drop policy if exists cognitive_assessments_update_own on public.cognitive_assessments;
create policy cognitive_assessments_update_own on public.cognitive_assessments
  for update using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

drop policy if exists cognitive_assessments_delete_own on public.cognitive_assessments;
create policy cognitive_assessments_delete_own on public.cognitive_assessments
  for delete using (therapist_id = auth.uid());

drop policy if exists gait_assessments_select_own on public.gait_assessments;
create policy gait_assessments_select_own on public.gait_assessments
  for select using (therapist_id = auth.uid());

drop policy if exists gait_assessments_update_own on public.gait_assessments;
create policy gait_assessments_update_own on public.gait_assessments
  for update using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

drop policy if exists gait_assessments_delete_own on public.gait_assessments;
create policy gait_assessments_delete_own on public.gait_assessments
  for delete using (therapist_id = auth.uid());

-- ============================================================
-- 5. RPC: 患者 anon-key 提交认知报告
--    (therapist_id 由 token 派生, 前端无法伪造; 校验 kind 匹配)
-- ============================================================
create or replace function public.submit_cognitive_assessment(
  p_share_token text,
  p_patient_name text,
  p_patient_age smallint,
  p_patient_gender text,
  p_payload jsonb,
  p_overall_score numeric default null,
  p_is_quick6 boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_therapist_id uuid;
  v_assessment_id uuid;
begin
  select therapist_id into v_therapist_id
  from public.qnr_share_links
  where token = p_share_token
    and revoked = false
    and expires_at > now()
    and kind = 'cognitive';

  if v_therapist_id is null then
    raise exception 'Invalid or expired share token' using errcode = 'P0001';
  end if;

  insert into public.cognitive_assessments (
    therapist_id, share_token, patient_name, patient_age, patient_gender,
    payload, overall_score, is_quick6, source
  ) values (
    v_therapist_id, p_share_token, p_patient_name, p_patient_age, p_patient_gender,
    p_payload, p_overall_score, p_is_quick6, 'qr'
  )
  returning id into v_assessment_id;

  update public.qnr_share_links
  set scan_count = scan_count + 1
  where token = p_share_token;

  return v_assessment_id;
end;
$$;

grant execute on function public.submit_cognitive_assessment to anon, authenticated;

comment on function public.submit_cognitive_assessment is
  '患者 anon-key 提交认知报告 RPC。therapist_id 由 token 派生, 不可伪造。返回评估 ID。';

-- ============================================================
-- 6. RPC: 患者 anon-key 提交步态报告
-- ============================================================
create or replace function public.submit_gait_assessment(
  p_share_token text,
  p_patient_name text,
  p_patient_age smallint,
  p_patient_gender text,
  p_payload jsonb,
  p_classification_primary text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_therapist_id uuid;
  v_assessment_id uuid;
begin
  select therapist_id into v_therapist_id
  from public.qnr_share_links
  where token = p_share_token
    and revoked = false
    and expires_at > now()
    and kind = 'gait';

  if v_therapist_id is null then
    raise exception 'Invalid or expired share token' using errcode = 'P0001';
  end if;

  insert into public.gait_assessments (
    therapist_id, share_token, patient_name, patient_age, patient_gender,
    payload, classification_primary, source
  ) values (
    v_therapist_id, p_share_token, p_patient_name, p_patient_age, p_patient_gender,
    p_payload, p_classification_primary, 'qr'
  )
  returning id into v_assessment_id;

  update public.qnr_share_links
  set scan_count = scan_count + 1
  where token = p_share_token;

  return v_assessment_id;
end;
$$;

grant execute on function public.submit_gait_assessment to anon, authenticated;

comment on function public.submit_gait_assessment is
  '患者 anon-key 提交步态报告 RPC。therapist_id 由 token 派生, 不可伪造。返回评估 ID。';

-- ============================================================
-- 7. create_qnr_share_link 加 p_kind 参数
--    (先 drop 旧签名再建, 避免重载歧义; 全参数有默认值, 旧调用兼容)
-- ============================================================
drop function if exists public.create_qnr_share_link(text, smallint, text, int);

create or replace function public.create_qnr_share_link(
  p_prefilled_name text default null,
  p_prefilled_age smallint default null,
  p_prefilled_gender text default null,
  p_expires_days int default 30,
  p_kind text default 'qnr'
) returns public.qnr_share_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_link public.qnr_share_links;
begin
  if p_kind not in ('qnr', 'cognitive', 'gait') then
    raise exception 'Invalid kind: %', p_kind using errcode = 'P0001';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into public.qnr_share_links (
    therapist_id, token, prefilled_name, prefilled_age, prefilled_gender, expires_at, kind
  ) values (
    auth.uid(), v_token, p_prefilled_name, p_prefilled_age, p_prefilled_gender,
    now() + make_interval(days => p_expires_days), p_kind
  )
  returning * into v_link;

  return v_link;
end;
$$;

grant execute on function public.create_qnr_share_link to authenticated;

-- ============================================================
-- 8. updated_at 触发器
-- ============================================================
drop trigger if exists cognitive_assessments_touch on public.cognitive_assessments;
create trigger cognitive_assessments_touch before update on public.cognitive_assessments
  for each row execute function public.touch_audit_brainmend();

drop trigger if exists gait_assessments_touch on public.gait_assessments;
create trigger gait_assessments_touch before update on public.gait_assessments
  for each row execute function public.touch_audit_brainmend();

-- ============================================================
-- 完成
-- ============================================================
-- 验证清单 (跑完后执行):
--   select 'cognitive_assessments' as t, count(*) from public.cognitive_assessments
--   union all select 'gait_assessments', count(*) from public.gait_assessments
--   union all select 'share_links_with_kind', count(*) from public.qnr_share_links where kind is not null;
--
--  RPC 验证 (anon key):
--   select public.submit_cognitive_assessment('<有效cognitive_token>', '测试', 30, '男', '{}'::jsonb);
--     有效 token → 返回 uuid; 无效/kind 不匹配 → 'Invalid or expired share token'
