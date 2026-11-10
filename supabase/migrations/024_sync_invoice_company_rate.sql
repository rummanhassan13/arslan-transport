-- Keep a shipment's invoice in step with its company rate.
--
-- An invoice stores its own trip ("transport") line, copied from the shipment when the
-- invoice was created. Editing the shipment's company rate afterwards did not touch that
-- line, so invoices created before a rate was entered kept showing 0.
--
-- After every shipment save, this sets the invoice's transport line to the shipment's
-- company rate and recalculates the invoice totals. Cancelled and deleted invoices are
-- left alone. It runs as the table owner because users who may edit shipments
-- (dispatchers, managers) have no write access to invoice lines.

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
      and i.status <> 'cancelled'
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

create or replace function public.sync_invoice_company_rate_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is null then
    perform public.sync_invoice_company_rate(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_invoice_company_rate_trigger() from public, anon, authenticated;

-- Runs on every shipment save (not only when the rate changes), so re-saving a shipment
-- also repairs an invoice that was already out of step.
drop trigger if exists sync_invoice_company_rate on public.shipments;
create trigger sync_invoice_company_rate
after update on public.shipments
for each row execute function public.sync_invoice_company_rate_trigger();

-- One-time repair: invoices whose trip amount is 0 while the shipment has a rate
-- (e.g. shipments 2302-2305).
do $$
declare
  v_shipment_id uuid;
begin
  for v_shipment_id in
    select distinct s.id
    from public.shipments s
    join public.invoices i on i.shipment_id = s.id and i.deleted_at is null and i.status <> 'cancelled'
    where s.deleted_at is null
      and coalesce(s.company_rate, 0) > 0
      and coalesce((
        select sum(it.amount) from public.invoice_items it
        where it.invoice_id = i.id and it.item_type = 'transport'
      ), 0) = 0
  loop
    perform public.sync_invoice_company_rate(v_shipment_id);
  end loop;
end $$;
