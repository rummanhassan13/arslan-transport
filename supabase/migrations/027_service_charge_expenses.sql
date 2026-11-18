-- Service charges on expenses.
-- A service charge is billed to the company (client) under a category like Fasah or Naql, but costs us nothing
-- and pays the driver nothing, so the whole Company Bill is profit. It is stored as an expense with
-- actual cost (amount) = 0, client_bill_amount > 0 and no driver pay.
--
-- Until now every expense needed an actual cost above zero. This keeps that rule for normal expenses and
-- allows 0 only for a billed, invoiced service charge that is not driver-reimbursable.
-- Only the first check differs from the version in 015. Safe to run more than once.

create or replace function public.validate_shipment_expense_treatment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.amount < 0 then
    raise exception 'Expense actual cost cannot be negative.';
  end if;
  if new.amount = 0 and not (
    new.client_billable
    and coalesce(new.client_bill_amount, 0) > 0
    and not new.driver_reimbursable
    and coalesce(new.driver_pay_amount, 0) = 0
  ) then
    raise exception 'Expense actual cost must be greater than zero (a zero-cost service charge must be billed to the company and pay nothing to the driver).';
  end if;
  if new.included_in_invoice and not new.client_billable then
    raise exception 'Only client-billable expenses can be included in an invoice.';
  end if;
  if new.driver_reimbursable and new.paid_by <> 'driver' then
    raise exception 'A driver-reimbursable expense must be recorded as paid by the driver.';
  end if;
  if new.driver_reimbursable and new.shipment_assignment_id is null then
    raise exception 'A driver-reimbursable expense requires a shipment assignment.';
  end if;
  if new.shipment_assignment_id is not null and not exists (
    select 1 from public.shipment_driver_assignments a
    where a.id = new.shipment_assignment_id
      and a.shipment_id = new.shipment_id
      and a.organization_id = new.organization_id
      and a.deleted_at is null
  ) then
    raise exception 'Expense assignment does not match the shipment and organization.';
  end if;
  return new;
end;
$$;
