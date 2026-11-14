-- Security hardening (audit of 10 Nov 2026).
--
-- 1. Attachment file paths must stay inside the organization's own storage folder
--    ("organizations/<organization_id>/..."), and a stored path cannot be changed later.
--    Without this, a staff user could save an attachment row pointing at another
--    organization's file and get a download link for it.
-- 2. Only the database itself may queue a file for permanent deletion. Users could
--    previously insert cleanup jobs for any file path.
-- 3. Sign-up with manual approval: anyone may create a login, but it gives no access
--    until an owner/admin approves the request and picks a role. Signed-in users can
--    no longer create organizations themselves.
--
-- Safe to run more than once. Existing attachment rows are not checked or changed, so
-- current uploads, downloads and deletes keep working.

-- ---------------------------------------------------------------------------
-- 1. Attachment paths
-- ---------------------------------------------------------------------------

create or replace function public.enforce_attachment_storage_path()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_key text;
  v_old_key text;
begin
  if tg_table_name = 'shipment_attachments' then
    v_new_key := new.storage_key;
    if tg_op = 'UPDATE' then v_old_key := old.storage_key; end if;
  else
    v_new_key := new.object_key;
    if tg_op = 'UPDATE' then v_old_key := old.object_key; end if;
  end if;

  if tg_op = 'UPDATE' then
    if v_new_key is distinct from v_old_key or new.organization_id is distinct from old.organization_id then
      raise exception 'An attachment''s stored file path and organization cannot be changed.';
    end if;
    return new;
  end if;

  if v_new_key is null or v_new_key not like 'organizations/' || new.organization_id::text || '/%' then
    raise exception 'Attachment file path must be inside the organization''s own storage folder.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_attachment_storage_path() from public, anon, authenticated;

drop trigger if exists enforce_shipment_attachment_storage_path on public.shipment_attachments;
create trigger enforce_shipment_attachment_storage_path
before insert or update on public.shipment_attachments
for each row execute function public.enforce_attachment_storage_path();

drop trigger if exists enforce_expense_attachment_storage_path on public.expense_attachments;
create trigger enforce_expense_attachment_storage_path
before insert or update on public.expense_attachments
for each row execute function public.enforce_attachment_storage_path();

-- ---------------------------------------------------------------------------
-- 2. File-deletion queue: written only by the soft-delete trigger
-- ---------------------------------------------------------------------------

drop policy if exists "attachment_cleanup_jobs_insert_attachment_roles" on public.attachment_cleanup_jobs;

create or replace function public.enqueue_attachment_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_object_key text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    v_object_key := case
      when tg_table_name = 'shipment_attachments' then to_jsonb(new)->>'storage_key'
      else to_jsonb(new)->>'object_key'
    end;
    -- Never queue a file outside the row's own organization folder.
    if nullif(v_object_key, '') is not null
      and v_object_key like 'organizations/' || new.organization_id::text || '/%' then
      insert into public.attachment_cleanup_jobs(organization_id, attachment_table, attachment_id, object_key)
      values (new.organization_id, tg_table_name, new.id, v_object_key)
      on conflict (attachment_table, attachment_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_attachment_cleanup() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sign-up with manual approval
-- ---------------------------------------------------------------------------

-- Organizations are created by the operator, not by whoever signs up.
drop policy if exists "organizations_insert_authenticated" on public.organizations;

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  company_name text,
  phone text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  organization_id uuid references public.organizations(id) on delete set null,
  approved_role text check (approved_role is null or approved_role in ('admin', 'manager', 'accountant', 'dispatcher', 'viewer')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_requests_status_idx on public.access_requests(status, created_at);

drop trigger if exists set_access_requests_updated_at on public.access_requests;
create trigger set_access_requests_updated_at
before update on public.access_requests
for each row execute function public.set_updated_at();

alter table public.access_requests enable row level security;

-- A person can see their own request. All writes go through the functions below.
drop policy if exists "access_requests_select_own" on public.access_requests;
create policy "access_requests_select_own" on public.access_requests
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.access_requests from anon;
revoke insert, update, delete on public.access_requests from authenticated;

-- Called by a signed-in user who has no organization yet. Creates (or returns) their request.
create or replace function public.request_access(
  p_full_name text default null,
  p_company_name text default null,
  p_phone text default null,
  p_message text default null
)
returns public.access_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_request public.access_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in first.';
  end if;

  select * into v_request from public.access_requests where user_id = v_user_id;
  if found then
    -- Let a pending requester fill in details they left empty; never reopen a reviewed request.
    if v_request.status = 'pending' then
      update public.access_requests
      set full_name = coalesce(full_name, nullif(left(trim(p_full_name), 120), '')),
          company_name = coalesce(company_name, nullif(left(trim(p_company_name), 160), '')),
          phone = coalesce(phone, nullif(left(trim(p_phone), 40), '')),
          message = coalesce(message, nullif(left(trim(p_message), 1000), ''))
      where id = v_request.id
      returning * into v_request;
    end if;
    return v_request;
  end if;

  select u.email into v_email from auth.users u where u.id = v_user_id;

  insert into public.access_requests (user_id, email, full_name, company_name, phone, message)
  values (
    v_user_id,
    coalesce(v_email, ''),
    nullif(left(trim(p_full_name), 120), ''),
    nullif(left(trim(p_company_name), 160), ''),
    nullif(left(trim(p_phone), 40), ''),
    nullif(left(trim(p_message), 1000), '')
  )
  returning * into v_request;
  return v_request;
end;
$$;

-- Pending requests, for owners and admins.
create or replace function public.list_access_requests()
returns setof public.access_requests
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid() and om.status = 'active' and om.role in ('owner', 'admin')
  ) then
    raise exception 'Only an owner or admin can review access requests.';
  end if;

  return query
  select * from public.access_requests
  where status = 'pending'
  order by created_at;
end;
$$;

-- Approve: adds the person to the organization with the chosen role.
-- Only an owner may grant the admin role; nobody can be made owner this way.
create or replace function public.approve_access_request(
  p_request_id uuid,
  p_organization_id uuid,
  p_role text
)
returns public.access_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.access_requests%rowtype;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Only an owner or admin of this organization can approve access.';
  end if;
  if p_role is null or p_role not in ('admin', 'manager', 'accountant', 'dispatcher', 'viewer') then
    raise exception 'Choose a valid role.';
  end if;
  if p_role = 'admin' and not public.has_org_role(p_organization_id, array['owner']) then
    raise exception 'Only an owner can grant the admin role.';
  end if;

  select * into v_request from public.access_requests where id = p_request_id for update;
  if not found then raise exception 'Access request not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'This request has already been reviewed.'; end if;

  insert into public.profiles (id, email, full_name, phone)
  values (v_request.user_id, v_request.email, v_request.full_name, v_request.phone)
  on conflict (id) do nothing;

  insert into public.organization_members (organization_id, user_id, role, status, invited_by, joined_at)
  values (p_organization_id, v_request.user_id, p_role, 'active', auth.uid(), now())
  on conflict (organization_id, user_id) do update
    set role = excluded.role, status = 'active', invited_by = excluded.invited_by, joined_at = coalesce(public.organization_members.joined_at, now())
    where public.organization_members.role <> 'owner';

  update public.access_requests
  set status = 'approved',
      organization_id = p_organization_id,
      approved_role = p_role,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id
  returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.reject_access_request(p_request_id uuid)
returns public.access_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.access_requests%rowtype;
begin
  if not exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid() and om.status = 'active' and om.role in ('owner', 'admin')
  ) then
    raise exception 'Only an owner or admin can review access requests.';
  end if;

  update public.access_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id and status = 'pending'
  returning * into v_request;
  if not found then raise exception 'Access request not found or already reviewed.'; end if;
  return v_request;
end;
$$;

revoke all on function public.request_access(text, text, text, text) from public, anon;
revoke all on function public.list_access_requests() from public, anon;
revoke all on function public.approve_access_request(uuid, uuid, text) from public, anon;
revoke all on function public.reject_access_request(uuid) from public, anon;
grant execute on function public.request_access(text, text, text, text) to authenticated;
grant execute on function public.list_access_requests() to authenticated;
grant execute on function public.approve_access_request(uuid, uuid, text) to authenticated;
grant execute on function public.reject_access_request(uuid) to authenticated;

-- Report anything on auth.users that could hand out access automatically on sign-up.
-- Check the "Messages"/notices output after running: there should be none.
do $$
declare
  r record;
begin
  for r in
    select tgname from pg_trigger
    where tgrelid = 'auth.users'::regclass and not tgisinternal
  loop
    raise notice 'Trigger on auth.users found: % (check it does not add new sign-ups to an organization)', r.tgname;
  end loop;
end $$;
