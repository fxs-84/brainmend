-- supabase/migrations/0005_tracking_records.sql
-- 头动追踪报告入库 (cervical_tracking_records)
-- 场景: 治疗师诊室里当面做的头动追踪, 不走 share_link, 直接用 Supabase session 关联 therapist_id
-- 已有 therapists / qnr_share_links 等沿用 0001_brainmend_baseline.sql

create extension if not exists "pgcrypto";

-- ============================================================
-- 表: cervical_tracking_records (头动追踪报告)
-- ============================================================
drop table if exists public.cervical_tracking_records cascade;
create table public.cervical_tracking_records (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null,
  patient_name text not null,
  patient_age text,
  patient_gender text,
  patient_id text,
  date timestamptz not null default now(),
  overall numeric,
  scores jsonb not null,
  details jsonb,
  vestibular jsonb,
  recommendations jsonb,
  source text default 'therapist',
  created_at timestamptz not null default now()
);

-- 索引
create index cervical_tracking_records_therapist_idx
  on public.cervical_tracking_records(therapist_id, date desc);

-- ============================================================
-- RLS
-- ============================================================
alter table public.cervical_tracking_records enable row level security;

-- 治疗师只看自己写的 (复用 0002 brainmend_is_admin 函数防递归)
create policy cervical_tracking_select_own
  on public.cervical_tracking_records for select
  to authenticated
  using (
    auth.uid() = therapist_id
    or public.brainmend_is_admin()
  );

-- 治疗师只能写自己的 (前端不能伪造 therapist_id, 但 RPC 用 SECURITY DEFINER 跳过)
create policy cervical_tracking_insert_own
  on public.cervical_tracking_records for insert
  to authenticated
  with check (auth.uid() = therapist_id);

-- 治疗师可删自己的 (云端清理用)
create policy cervical_tracking_delete_own
  on public.cervical_tracking_records for delete
  to authenticated
  using (
    auth.uid() = therapist_id
    or public.brainmend_is_admin()
  );

-- ============================================================
-- RPC: submit_tracking_record (anon/认证都能调用, 但实际上治疗师必须登录才有意义)
-- 用 SECURITY DEFINER 绕过 RLS, 把 therapist_id = auth.uid() 写死
-- ============================================================
create or replace function public.submit_tracking_record(
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_therapist_id uuid := auth.uid();
  v_assessment_id uuid;
  v_patient_name text;
begin
  -- 必须登录
  if v_therapist_id is null then
    raise exception '请先在治疗师登录后, 再上传头动追踪报告';
  end if;

  v_patient_name := coalesce(p_payload->>'patient_name', '匿名');
  if v_patient_name = '' then
    v_patient_name := '匿名';
  end if;

  insert into public.cervical_tracking_records (
    therapist_id, patient_name, patient_age, patient_gender, patient_id,
    date, overall, scores, details, vestibular, recommendations, source
  ) values (
    v_therapist_id,
    v_patient_name,
    p_payload->>'patient_age',
    p_payload->>'patient_gender',
    p_payload->>'patient_id',
    coalesce((p_payload->>'date')::timestamptz, now()),
    (p_payload->>'overall')::numeric,
    coalesce(p_payload->'scores', '{}'::jsonb),
    p_payload->'details',
    p_payload->'vestibular',
    coalesce(p_payload->'recommendations', '[]'::jsonb),
    coalesce(p_payload->>'source', 'therapist')
  )
  returning id into v_assessment_id;

  return v_assessment_id;
end;
$$;

grant execute on function public.submit_tracking_record to authenticated, anon;

comment on function public.submit_tracking_record is
  '头动追踪报告入库 RPC。therapist_id = auth.uid(), 不可伪造。返回报告 ID。';

-- ============================================================
-- 验证清单:
--   1. cervical_tracking_records 表存在
--   2. submit_tracking_record 函数存在
--   3. 治疗师登录后 POST /rest/v1/rpc/submit_tracking_record → DB 有新行
-- ============================================================