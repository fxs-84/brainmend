-- 0002 修复: 治疗师 RLS 策略无限递归
--
-- 症状:
--   select * from therapists;
--   → "infinite recursion detected in policy for relation 'therapists'"
--
-- 根因:
--   therapists_select_own 策略里有:
--     or exists (select 1 from public.therapists where id = auth.uid() and role = 'admin')
--   这条子查询引用了 therapists 表自身, 触发同一个 RLS 策略, 无限循环
--
-- 修复:
--   用 SECURITY DEFINER 函数 brainmend_is_admin() 替代直接子查询
--   SECURITY DEFINER 让函数以定义者权限执行, 绕过 RLS, 不会递归

-- 1. 新增 brainmend_is_admin() 函数 (幂等)
create or replace function public.brainmend_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.therapists
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 2. 重建 therapists_select_own (幂等)
drop policy if exists therapists_select_own on public.therapists;
create policy therapists_select_own on public.therapists
  for select using (
    id = auth.uid()
    or public.brainmend_is_admin()
  );

-- 验证修复 (跑完后执行):
--   select * from public.therapists limit 1;
--   应该返回空数组 (而不是 500 错误)