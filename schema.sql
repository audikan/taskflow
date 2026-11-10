-- Chạy một lần trong Supabase > SQL Editor.
-- Mọi thành viên có quyền ngang nhau. Chỉ thành viên của một workspace mới xem/sửa task.
create extension if not exists pgcrypto;

create table if not exists public.tf_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  invite_hash text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.tf_memberships (
  workspace_id uuid not null references public.tf_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create table if not exists public.tf_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.tf_workspaces(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tf_tasks_workspace_idx on public.tf_tasks(workspace_id);
create index if not exists tf_memberships_user_idx on public.tf_memberships(user_id);

create or replace function public.tf_is_member(p_workspace uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.tf_memberships where workspace_id=p_workspace and user_id=(select auth.uid())) $$;
revoke all on function public.tf_is_member(uuid) from public;
grant execute on function public.tf_is_member(uuid) to authenticated;

alter table public.tf_workspaces enable row level security;
alter table public.tf_memberships enable row level security;
alter table public.tf_tasks enable row level security;

-- Invite hash không được phép đọc từ trình duyệt: workspace metadata được trả qua RPC.
revoke all on public.tf_workspaces from anon, authenticated;
revoke all on public.tf_memberships from anon, authenticated;
grant select, insert, update, delete on public.tf_tasks to authenticated;

drop policy if exists tf_tasks_select on public.tf_tasks;
create policy tf_tasks_select on public.tf_tasks for select to authenticated
  using (public.tf_is_member(workspace_id));
drop policy if exists tf_tasks_insert on public.tf_tasks;
create policy tf_tasks_insert on public.tf_tasks for insert to authenticated
  with check (public.tf_is_member(workspace_id) and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
drop policy if exists tf_tasks_update on public.tf_tasks;
create policy tf_tasks_update on public.tf_tasks for update to authenticated
  using (public.tf_is_member(workspace_id))
  with check (public.tf_is_member(workspace_id) and updated_by=(select auth.uid()));
drop policy if exists tf_tasks_delete on public.tf_tasks;
create policy tf_tasks_delete on public.tf_tasks for delete to authenticated
  using (public.tf_is_member(workspace_id));

-- Tạo workspace, lưu hash của mã mời; tối đa 5 người trong một nhóm.
create or replace function public.tf_create_workspace(p_name text, p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Cần đăng nhập'; end if;
  if length(trim(p_name)) not between 1 and 100 or length(p_code) < 16 then raise exception 'Tên hoặc mã mời không hợp lệ'; end if;
  insert into public.tf_workspaces(name,invite_hash,created_by)
  values (trim(p_name),encode(extensions.digest(p_code,'sha256'),'hex'),(select auth.uid())) returning id into v_id;
  insert into public.tf_memberships(workspace_id,user_id) values(v_id,(select auth.uid()));
  return v_id;
end $$;

create or replace function public.tf_join_workspace(p_workspace uuid, p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_name text; v_hash text; v_count integer;
begin
  if (select auth.uid()) is null then raise exception 'Cần đăng nhập'; end if;
  -- Lock dòng workspace để xử lý chính xác giới hạn số thành viên.
  select name,invite_hash into v_name,v_hash from public.tf_workspaces where id=p_workspace for update;
  if v_name is null or v_hash <> encode(extensions.digest(p_code,'sha256'),'hex') then
    raise exception 'Không tìm thấy nhóm hoặc mã mời không đúng';
  end if;
  if not exists (select 1 from public.tf_memberships where workspace_id=p_workspace and user_id=(select auth.uid())) then
    select count(*) into v_count from public.tf_memberships where workspace_id=p_workspace;
    if v_count >= 5 then raise exception 'Nhóm đã đủ 5 người'; end if;
    insert into public.tf_memberships(workspace_id,user_id) values (p_workspace,(select auth.uid()));
  end if;
  return v_name;
end $$;

create or replace function public.tf_my_workspaces()
returns table(id uuid, name text, member_count bigint)
language sql stable security definer set search_path = '' as $$
  select w.id,w.name,(select count(*) from public.tf_memberships m2 where m2.workspace_id=w.id)
  from public.tf_workspaces w join public.tf_memberships m on m.workspace_id=w.id
  where m.user_id=(select auth.uid()) order by w.created_at desc
$$;

revoke all on function public.tf_create_workspace(text,text) from public;
revoke all on function public.tf_join_workspace(uuid,text) from public;
revoke all on function public.tf_my_workspaces() from public;
grant execute on function public.tf_create_workspace(text,text) to authenticated;
grant execute on function public.tf_join_workspace(uuid,text) to authenticated;
grant execute on function public.tf_my_workspaces() to authenticated;

-- Đồng bộ các thay đổi theo thời gian thực.
do $$ begin
  alter publication supabase_realtime add table public.tf_tasks;
exception when duplicate_object then null;
end $$;
