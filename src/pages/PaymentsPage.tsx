import { useState } from "react";
import { Search, Trash2, X } from "lucide-react";
import type { ClientPayment, DriverPayment, Invoice, Shipment } from "../types/domain";
import { formatDate, money, labelize } from "../utils/formatters";
import { EmptyState, KpiGrid, PageTitle, StatusBadge, DataTable } from "../components/ui";
import {
  calculateInvoiceBalance,
  signedClientPaymentAmount,
  signedDriverPaymentAmount,
  sumMoney,
} from "../domain/financials";
import { companyPaymentStatusLabel } from "../utils/statusDerivation";

// The page-level "Add Payment" button is hidden; driver payments are made from the shipment pop-up ("Pay driver").
const SHOW_PAYMENTS_PAGE_ADD_BUTTON = false;

export function PaymentsPage({
  shipments,
  invoices = [],
  clientPayments = [],
  driverPayments = [],
  loading = false,
  error = null,
  openPayment,
  deleteClientPayment,
  deleteDriverPayment,
  embedded = false,
}: {
  shipments: Shipment[];
  invoices?: Invoice[];
  clientPayments?: ClientPayment[];
  driverPayments?: DriverPayment[];
  loading?: boolean;
  error?: string | null;
  openPayment: () => void;
  deleteClientPayment?: (paymentId: string) => Promise<void> | void;
  deleteDriverPayment?: (paymentId: string) => Promise<void> | void;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<"Company Receivables" | "Driver Payouts">("Company Receivables");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const matches = (...values: (string | null | undefined)[]) =>
    !query || values.some((value) => (value ?? "").toLowerCase().includes(query));
  const shipmentById = new Map(shipments.map((shipment) => [shipment.id, shipment]));
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  /** The shipment reference shown everywhere else in the app (invoice reference, else shipment number). */
  const shipmentLabel = (shipmentId: string | null, fallback?: string | null) =>
    (shipmentId ? shipmentById.get(shipmentId)?.invoice : undefined) || fallback || "-";
  const invoiceRows = invoices.length ? invoices : [];
  const paidByInvoice = new Map<string, number>();
  clientPayments.forEach((payment) => {
    paidByInvoice.set(payment.invoiceId, sumMoney([paidByInvoice.get(payment.invoiceId) ?? 0, signedClientPaymentAmount(payment)]));
  });
  const invoiceBalances = invoiceRows
    .filter((invoice) => invoice.status !== "cancelled")
    .map((invoice) => calculateInvoiceBalance(invoice, clientPayments));
  const paidThisPeriod = sumMoney(clientPayments.map(signedClientPaymentAmount));
  const outstanding = sumMoney(invoiceBalances.map((balance) => balance.balance));
  const overdue = sumMoney(invoiceBalances.filter((balance) => balance.overdue).map((balance) => balance.balance));
  const driverPayables = sumMoney(shipments.map((shipment) => shipment.pending));

  const visibleInvoiceRows = invoiceRows.filter((row) =>
    matches(row.invoiceNumber, row.clientName, row.clientSnapshot.name as string | undefined, shipmentLabel(row.shipmentId, row.shipmentReference)),
  );
  const visibleShipmentRows = shipments.filter((row) => matches(row.invoice, row.customer));
  const visibleClientPayments = clientPayments.filter((payment) => {
    const invoice = invoiceById.get(payment.invoiceId);
    return matches(
      payment.invoiceNumber ?? invoice?.invoiceNumber,
      shipmentLabel(payment.shipmentId ?? invoice?.shipmentId ?? null, payment.shipmentReference),
      payment.clientName ?? invoice?.clientName,
      payment.referenceNo,
    );
  });
  const visibleDriverRows = shipments.filter((row) => matches(row.invoice, row.driverName));
  const visibleDriverPayments = driverPayments.filter((payment) =>
    matches(shipmentLabel(payment.shipmentId, payment.shipmentReference), payment.driverName, payment.referenceNo),
  );
  return (
    <>
      {embedded ? (
        <section className="filter-card">
          <div className="filter-toolbar">
            <div>
              <h3>Payments</h3>
              <p>Company receivables and driver settlement tracking.</p>
            </div>
            {SHOW_PAYMENTS_PAGE_ADD_BUTTON && (
              <button className="btn-primary" onClick={openPayment}>
                Add Payment
              </button>
            )}
          </div>
        </section>
      ) : (
        <PageTitle
          title="Payments"
          subtitle="Company receivables and driver settlement tracking."
          action={SHOW_PAYMENTS_PAGE_ADD_BUTTON ? "Add Payment" : undefined}
          onAction={SHOW_PAYMENTS_PAGE_ADD_BUTTON ? openPayment : undefined}
        />
      )}
      <KpiGrid
        items={[
          ["Outstanding", money(outstanding), "Company amounts not fully paid"],
          ["Paid this period", money(paidThisPeriod), "Based on current shipment statuses"],
          ["Overdue", money(overdue), "Needs payment follow-up"],
          ["Driver Payables", money(driverPayables), "Open driver settlement balance"],
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="period">
          {["Company Receivables", "Driver Payouts"].map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item as typeof tab)}>
              {item}
            </button>
          ))}
        </div>
        <div className="table-filters">
          <div className="compact-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tab === "Company Receivables" ? "Search invoice, shipment, company..." : "Search shipment, driver..."}
              aria-label="Search payments"
            />
          </div>
          {search && (
            <button className="icon-btn text-ink-3 hover:text-ink" onClick={() => setSearch("")} title="Clear search" type="button">
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {tab === "Company Receivables" ? (
        <>
        <div className="table-card">
          <div className="table-title">
            <div>
              <h3>Company receivables ledger</h3>
              <p>Invoice-level receivables grouped by company context.</p>
            </div>
            <span className="status num">{invoiceRows.length ? visibleInvoiceRows.length : visibleShipmentRows.length} rows</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Company</th>
                  <th>Date</th>
                  <th className="num text-right">Company Total</th>
                  <th className="num text-right">Paid</th>
                  <th className="num text-right">Pending</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.length ? visibleInvoiceRows.map((row) => {
                  const balance = calculateInvoiceBalance(row, clientPayments);
                  const paid = balance.paid;
                  const pending = balance.balance;
                  const status = balance.status;
                  return (
                    <tr key={row.id}>
                      <td className="num">
                        <span className="invoice-cell">{row.invoiceNumber}</span>
                      </td>
                      <td className="customer-cell">{row.clientName || (row.clientSnapshot.name as string) || "Company"}</td>
                      <td className="num">{formatDate(row.issueDate)}</td>
                      <td className="num">{money(row.totalAmount)}</td>
                      <td className="num">{money(paid)}</td>
                      <td className="num">{money(pending)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge status={status} />
                          <StatusBadge status={row.status} />
                        </div>
                      </td>
                      <td>
                        <button className="table-action" onClick={openPayment}>Record</button>
                      </td>
                    </tr>
                  );
                }) : visibleShipmentRows.map((row) => {
                  const pending = row.clientBalance ?? row.companyTotal;
                  return (
                    <tr key={row.id}>
                      <td className="num"><span className="invoice-cell">{row.invoice}</span></td>
                      <td className="customer-cell">{row.customer}</td>
                      <td className="num">{formatDate(row.date)}</td>
                      <td className="num">{money(row.companyTotal)}</td>
                      <td className="num">{money(row.companyTotal - pending)}</td>
                      <td className="num">{money(pending)}</td>
                      <td><div className="flex flex-wrap gap-1.5"><StatusBadge status={row.clientPaymentStatus} label={companyPaymentStatusLabel(row.clientPaymentStatus)} /><StatusBadge status={row.invoiceStatus} /></div></td>
                      <td><button className="table-action" onClick={openPayment}>Record</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loading && <EmptyState text="Loading payments..." />}
            {!loading && !invoiceRows.length && !shipments.length && <EmptyState text="No company receivables yet." />}
            {!loading && query && (invoiceRows.length ? !visibleInvoiceRows.length : shipments.length > 0 && !visibleShipmentRows.length) && (
              <EmptyState text="No receivables match the current search." />
            )}
          </div>
        </div>
        <div className="mt-6">
          <DataTable
            title="Company Payments History"
            columns={["Date", "Invoice", "Shipment", "Company", "Amount", "Method", "Reference", "Action"]}
            rows={visibleClientPayments.map((payment) => {
              const invoice = invoiceById.get(payment.invoiceId);
              const customerName = payment.clientName || invoice?.clientName || "Company";
              return [
                formatDate(payment.paymentDate),
                <span className="invoice-cell">{payment.invoiceNumber || invoice?.invoiceNumber || "-"}</span>,
                shipmentLabel(payment.shipmentId ?? invoice?.shipmentId ?? null, payment.shipmentReference ?? invoice?.shipmentReference),
                customerName,
                money(signedClientPaymentAmount(payment)),
                payment.paymentMethod || "-",
                payment.referenceNo || "-",
                deleteClientPayment && payment.direction !== -1 ? (
                  <button
                    className="icon-btn text-ink-3 hover:text-red-500"
                    onClick={() => {
                      if (window.confirm("Delete this payment? It will be removed from active balances and retained in audit history.")) {
                        void deleteClientPayment(payment.id);
                      }
                    }}
                    title="Delete Payment"
                    aria-label={`Delete company payment ${payment.id}`}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  "-"
                ),
              ];
            })}
          />
          {clientPayments.length === 0 && <EmptyState text="No company payment transactions recorded yet." />}
          {clientPayments.length > 0 && visibleClientPayments.length === 0 && <EmptyState text="No company payments match the current search." />}
        </div>
        </>
      ) : (
        <>
        <div className="table-card">
          <div className="table-title">
            <div>
              <h3>Driver payout ledger</h3>
              <p>Trip-level driver payable amounts, advances, and pending balances.</p>
            </div>
            <span className="status num">{visibleDriverRows.length} rows</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Invoice</th>
                  <th className="num text-right">Driver Rate</th>
                  <th className="num text-right">Advance</th>
                  <th className="num text-right">Driver Total</th>
                  <th className="num text-right">Pending</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleDriverRows.map((row) => {
                  const pending = row.pending;
                  const status = row.driverPaymentStatus;
                  return (
                    <tr key={row.id}>
                      <td className="customer-cell">{row.driverName}</td>
                      <td className="num"><span className="invoice-cell">{row.invoice}</span></td>
                      <td className="num">{money(row.driverRate)}</td>
                      <td className="num">{money(row.advance)}</td>
                      <td className="num">{money(row.driverTotal)}</td>
                      <td className="num">{money(pending)}</td>
                      <td><StatusBadge status={status} /></td>
                      <td><button className="table-action" onClick={openPayment}>Pay</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loading && <EmptyState text="Loading driver payouts..." />}
            {!loading && !shipments.length && <EmptyState text="No driver payouts yet." />}
            {!loading && shipments.length > 0 && !visibleDriverRows.length && <EmptyState text="No driver payouts match the current search." />}
          </div>
        </div>
        <div className="mt-6">
          <DataTable
            title="Driver Payouts History"
            columns={["Date", "Shipment", "Driver", "Amount", "Type", "Method", "Reference", "Action"]}
            rows={visibleDriverPayments.map((payment) => {
              const name = payment.driverName || shipments.find((s) => s.driverId === payment.driverId)?.driverName || "Driver";
              return [
                formatDate(payment.paymentDate),
                shipmentLabel(payment.shipmentId, payment.shipmentReference),
                name,
                money(signedDriverPaymentAmount(payment)),
                payment.direction === -1 ? "Reversal" : labelize(payment.paymentType),
                payment.paymentMethod || "-",
                payment.referenceNo || "-",
                deleteDriverPayment && payment.direction !== -1 ? (
                  <button
                    className="icon-btn text-ink-3 hover:text-red-500"
                    onClick={() => {
                      if (window.confirm("Delete this driver payment? It will be removed from active balances and retained in audit history.")) {
                        void deleteDriverPayment(payment.id);
                      }
                    }}
                    title="Delete Payment"
                    aria-label={`Delete driver payment ${payment.id}`}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  "-"
                ),
              ];
            })}
          />
          {driverPayments.length === 0 && <EmptyState text="No driver payouts recorded yet." />}
          {driverPayments.length > 0 && visibleDriverPayments.length === 0 && <EmptyState text="No driver payments match the current search." />}
        </div>
        </>
      )}
    </>
  );
}
