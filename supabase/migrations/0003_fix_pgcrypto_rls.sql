-- 0003 修复: pgcrypto + qnr_share_links RLS
--
-- 问题 1: gen_random_bytes() 不存在
--   原因: pgcrypto 扩展没启用 (Supabase 默认通常启用, 但有些项目可能没)
--   解决: 显式 create extension, 然后用 gen_random_uuid() 替代 gen_random_bytes
--
-- 问题 2: qnr_share_links INSERT 报 42501 row-level security
--   原因: auth.uid() 在 INSERT 瞬间是有效的, 但 with check 触发
--         qnr_share_links_insert_own 的条件: therapist_id = auth.uid()
--         这里我们 INSERT 时不传 therapist_id (默认 null), 所以 with check 失败
--   解决: 修 RPC 函数, 内部用 auth.uid() 强制设置 therapist_id (而不是由调用方传)
--         INSERT...SELECT 模式: 从一个不返回 therapist_id 的常量查询插入

-- 1. 显式启用 pgcrypto
create extension if not exists "pgcrypto";

-- 2. 重建 create_qnr_share_link RPC (修复 token 生成 + 自动写入 therapist_id)
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
  -- 32 字符 token (UUID 去横线, 不用 pgcrypto)
  v_token := replace(gen_random_uuid()::text, '-', '');

  -- INSERT 时显式写 therapist_id = auth.uid()
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

-- 验证修复 (跑完后执行):
--   1. 浏览器登录治疗师 → 打开工作台 → 点 "+ 创建链接"
--      应该成功, 拿到 token
--   2. select * from public.qnr_share_links limit 5;
--      应该看到新建的行, therapist_id = 治疗师 ID