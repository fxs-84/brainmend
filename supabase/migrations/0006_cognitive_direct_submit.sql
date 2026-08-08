-- supabase/migrations/0006_cognitive_direct_submit.sql
-- 认知报告直传 RPC: 治疗师登录后本机做题, 报告直接入库 (不需要 share_link/二维码)
-- 场景: 认知评估改为"不登录直接本机测试"后, 登录的治疗师做的报告要能直接归属自己
-- 与 0005 submit_tracking_record 同模式: therapist_id = auth.uid(), 不可伪造

create or replace function public.submit_cognitive_assessment_direct(
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
  -- 必须登录 (治疗师本机做题直传)
  if v_therapist_id is null then
    raise exception '请先登录治疗师账号, 再上传认知报告' using errcode = 'P0001';
  end if;

  v_patient_name := coalesce(p_payload->>'patient_name', '匿名');
  if v_patient_name = '' then
    v_patient_name := '匿名';
  end if;

  insert into public.cognitive_assessments (
    therapist_id, share_token, patient_name, patient_age, patient_gender,
    payload, overall_score, is_quick6, source
  ) values (
    v_therapist_id,
    null,
    v_patient_name,
    (p_payload->>'patient_age')::smallint,
    p_payload->>'patient_gender',
    coalesce(p_payload->'payload', '{}'::jsonb),
    (p_payload->>'overall_score')::numeric,
    coalesce((p_payload->>'is_quick6')::boolean, false),
    'therapist'
  )
  returning id into v_assessment_id;

  return v_assessment_id;
end;
$$;

grant execute on function public.submit_cognitive_assessment_direct to authenticated;

comment on function public.submit_cognitive_assessment_direct is
  '治疗师登录后直传认知报告 RPC (本机做题, 不走 share_link)。therapist_id = auth.uid(), 不可伪造。返回评估 ID。';

-- 验证: 治疗师登录后 POST /rest/v1/rpc/submit_cognitive_assessment_direct
--   {"p_payload": {"patient_name": "测试", "payload": {...}, "overall_score": 80}}
-- 应返回 uuid, 且 cognitive_assessments 新行 source='therapist'
