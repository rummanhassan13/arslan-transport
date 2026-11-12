import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Card, PageTitle } from "../components/ui";
import type { Driver, Shipment, ShipmentExpense } from "../types/domain";
import { formatDate, money } from "../utils/formatters";
import {
  REPORT_PERIOD_OPTIONS,
  buildShipmentReportRows,
  isInReportRange,
  resolveReportRange,
  toIsoDate,
  totalReportRows,
  type ReportPeriodPreset,
} from "../domain/shipmentReport";
import { downloadShipmentReportCsv, downloadShipmentReportXlsx } from "../services/reportExport";

type ReportsPageProps = {
  shipments: Shipment[];
  expenses: ShipmentExpense[];
  drivers: Driver[];
};

export function ReportsPage({ shipments, expenses, drivers }: ReportsPageProps) {
  return (
    <>
      <PageTitle
        title="Reports"
        subtitle="Generate and export operations and financial reports."
      />
      <section className="report-grid">
        <ShipmentReportCard shipments={shipments} expenses={expenses} drivers={drivers} />
      </section>
    </>
  );
}

function periodLabel(start: string, end: string) {
  if (!start && !end) return "All dates";
  if (start && end) return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
  return start ? `From ${formatDate(start)}` : `Until ${formatDate(end)}`;
}

function ShipmentReportCard({ shipments, expenses, drivers }: ReportsPageProps) {
  const [preset, setPreset] = useState<ReportPeriodPreset>("this_month");
  const [month, setMonth] = useState(() => toIsoDate(new Date()).slice(0, 7));
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customer, setCustomer] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);
  const [exportError, setExportError] = useState("");

  const range = useMemo(
    () => resolveReportRange(preset, { month, start: customStart, end: customEnd }),
    [preset, month, customStart, customEnd],
  );

  const customers = useMemo(
    () => Array.from(new Set(shipments.map((s) => s.customer).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [shipments],
  );

  const rows = useMemo(() => {
    const inScope = shipments.filter(
      (s) => !s.deletedAt && (!customer || s.customer === customer) && isInReportRange(s, range),
    );
    return buildShipmentReportRows(inScope, expenses, drivers);
  }, [shipments, expenses, drivers, customer, range]);

  const totals = useMemo(() => totalReportRows(rows), [rows]);
  const label = periodLabel(range.start, range.end);
  const invalidRange = Boolean(range.start && range.end && range.start > range.end);

  const runExport = async (format: "xlsx" | "csv") => {
    setExportError("");
    setExporting(format);
    try {
      const meta = { range, periodLabel: label, customer: customer || "All companies" };
      if (format === "xlsx") await downloadShipmentReportXlsx(rows, meta);
      else downloadShipmentReportCsv(rows, meta);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  };

  const exportDisabled = rows.length === 0 || invalidRange || exporting !== null;

  return (
    <Card title="Shipment Report">
      <div className="report-card-body">
        <div className="report-filter-grid">
          <label className="field">
            <span>Period</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value as ReportPeriodPreset)}>
              {REPORT_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {preset === "month" && (
            <label className="field">
              <span>Month</span>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </label>
          )}
          {preset === "custom" && (
            <>
              <label className="field">
                <span>Start date</span>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </label>
              <label className="field">
                <span>End date</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </label>
            </>
          )}
          <label className="field">
            <span>Company</span>
            <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">All companies</option>
              {customers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <div className="report-summary" aria-label="Report totals">
          <div><span>Shipments</span><strong>{rows.length}</strong></div>
          <div><span>Company total</span><strong>{money(totals.companyTotal ?? 0)}</strong></div>
          <div><span>Driver total</span><strong>{money(totals.driverTotal ?? 0)}</strong></div>
          <div><span>Net profit</span><strong>{money(totals.netProfit ?? 0)}</strong></div>
        </div>

        <div className="report-preview">
          <div className="report-preview-header">
            <strong>{label}</strong>
            <span>
              {invalidRange
                ? "Start date is after end date."
                : `${rows.length} shipment${rows.length === 1 ? "" : "s"} · all statuses · exports include every report column`}
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shipment No</th>
                  <th>Customer</th>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th className="num">Company Total</th>
                  <th className="num">Driver Total</th>
                  <th className="num">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.serial}-${row.shipmentNo}`}>
                    <td className="num">{row.date ? formatDate(row.date) : "-"}</td>
                    <td>{row.shipmentNo}</td>
                    <td>{row.customer}</td>
                    <td>{row.loadingPoint} → {row.destination}</td>
                    <td>{row.driverName}</td>
                    <td>{row.vehicleNo}</td>
                    <td>{row.shipmentStatus}</td>
                    <td className="num">{money(row.companyTotal)}</td>
                    <td className="num">{money(row.driverTotal)}</td>
                    <td className="num">{money(row.netProfit)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={10}><div className="empty-state">No shipments in this period.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {exportError && <p className="form-error" role="alert">{exportError}</p>}
        <div className="report-actions">
          <button className="btn-ghost" type="button" disabled={exportDisabled} onClick={() => void runExport("csv")}>
            <FileText size={16} /> {exporting === "csv" ? "Exporting…" : "Export CSV"}
          </button>
          <button className="btn-primary" type="button" disabled={exportDisabled} onClick={() => void runExport("xlsx")}>
            <FileSpreadsheet size={16} /> {exporting === "xlsx" ? "Exporting…" : "Export Excel"}
          </button>
        </div>
      </div>
    </Card>
  );
}
