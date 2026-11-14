-- Security hardening, part 2 (audit of 10 Nov 2026).
--
-- 1. Role changes: an admin could make themselves (or anyone) an owner, after which the real
--    owner could not remove them. Now only an existing owner may grant the owner or admin
--    role, and nobody but an owner may change their own role.
-- 2. Anonymous visitors (not signed in) can no longer run any database function. Every
--    function already refused them, so this removes risk without changing what the app does.
--
-- 3. Invoice sync: changing a shipment's company rate now only updates invoices that are
--    still drafts. Sent, paid, partly paid and overdue invoices stay exactly as the customer
--    received them (owner's decision, 14 Nov 2026).
--
-- Safe to run more than once. Running it in the SQL editor (no signed-in user) is never blocked.

-- ---------------------------------------------------------------------------
-- 1. Role guards on organization_members
-- ---------------------------------------------------------------------------

create or replace function public.guard_organization_member_roles()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_is_owner boolean;
begin
  -- Operator actions (SQL editor, service key, migrations) have no signed-in user.
  if v_actor is null then
    return new;
  end if;

  v_actor_is_owner := public.has_org_role(new.organization_id, array['owner']);

  if new.role in ('owner', 'admin')
    and (tg_op = 'INSERT' or new.role is distinct from old.role)
    and not v_actor_is_owner then
    raise exception 'Only an owner can give someone the % role.', new.role;
  end if;

  if tg_op = 'UPDATE'
    and old.user_id = v_actor
    and new.role is distinct from old.role
    and not v_actor_is_owner then
    raise exception 'You cannot change your own role. Ask an owner.';
  end if;

  if tg_op = 'UPDATE'
    and new.organization_id is distinct from old.organization_id then
    raise exception 'A membership cannot be moved to another organization.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_organization_member_roles() from public, anon, authenticated;

drop trigger if exists guard_organization_member_roles on public.organization_members;
create trigger guard_organization_member_roles
before insert or update on public.organization_members
for each row execute function public.guard_organization_member_roles();

-- ---------------------------------------------------------------------------
-- 3. Invoice sync only touches draft invoices (replaces the version from 024)
-- ---------------------------------------------------------------------------

create or replace function public.sync_invoice_company_rate(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment public.shipments%rowtype;
  v_invoice_id uuid;
  v_transport_id uuid;
  v_rate numeric(12,2);
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then return; end if;
  v_rate := coalesce(v_shipment.company_rate, 0);

  for v_invoice_id in
    select i.id from public.invoices i
    where i.shipment_id = p_shipment_id
      and i.organization_id = v_shipment.organization_id
      and i.deleted_at is null
      and i.status = 'draft'
  loop
    -- An invoice has one transport line; extra ones are left-overs from an old bug.
    select it.id into v_transport_id
    from public.invoice_items it
    where it.invoice_id = v_invoice_id and it.item_type = 'transport'
    order by it.created_at, it.id
    limit 1;

    if v_transport_id is null then
      insert into public.invoice_items (
        organization_id, invoice_id, item_type, description, quantity, unit_price, amount, snapshot
      ) values (
        v_shipment.organization_id, v_invoice_id, 'transport',
        'TRIP FROM: ' || v_shipment.loading_point || ' TO ' || v_shipment.destination,
        1, v_rate, v_rate,
        jsonb_build_object('shipmentId', v_shipment.id, 'shipmentNo', v_shipment.shipment_no)
      );
    else
      update public.invoice_items
      set unit_price = v_rate, amount = v_rate, quantity = 1
      where id = v_transport_id
        and (amount is distinct from v_rate or unit_price is distinct from v_rate);

      delete from public.invoice_items
      where invoice_id = v_invoice_id and item_type = 'transport' and id <> v_transport_id;
    end if;

    update public.invoices i
    set subtotal = t.subtotal,
        expense_total = t.expense_total,
        total_amount = t.total,
        shipment_snapshot = jsonb_set(coalesce(i.shipment_snapshot, '{}'::jsonb), '{companyRate}', to_jsonb(v_rate))
    from (
      select
        coalesce(sum(amount) filter (where item_type <> 'expense'), 0) as subtotal,
        coalesce(sum(amount) filter (where item_type = 'expense'), 0) as expense_total,
        coalesce(sum(amount), 0) as total
      from public.invoice_items
      where invoice_id = v_invoice_id
    ) t
    where i.id = v_invoice_id
      and (i.subtotal is distinct from t.subtotal
        or i.expense_total is distinct from t.expense_total
        or i.total_amount is distinct from t.total
        or i.shipment_snapshot->'companyRate' is distinct from to_jsonb(v_rate));
  end loop;
end;
$$;

revoke all on function public.sync_invoice_company_rate(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. No database functions for anonymous visitors
-- ---------------------------------------------------------------------------
-- Functions are runnable by "public" (everyone) unless revoked, and Supabase also grants
-- them to anon directly. For each function in the public schema: keep exactly the access
-- signed-in users and the service key have today, then remove it from public and anon.

do $$
declare
  f record;
begin
  for f in
    select p.oid, p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and d.objid is null -- skip functions that belong to extensions
  loop
    if has_function_privilege('authenticated', f.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', f.signature);
    end if;
    if has_function_privilege('service_role', f.oid, 'execute') then
      execute format('grant execute on function %s to service_role', f.signature);
    end if;
    execute format('revoke execute on function %s from public, anon', f.signature);
  end loop;
end $$;

-- Functions created later should not be open to anonymous visitors either.
alter default privileges in schema public revoke execute on functions from public, anon;
