import type { Driver, Shipment, ShipmentExpense } from "../types/domain";
import { getExpenseDisplayAmount, roundMoney, sumMoney } from "./financials";

/* ------------------------------------------------------------------ */
/* Date range                                                          */
/* ------------------------------------------------------------------ */

export type ReportPeriodPreset = "this_month" | "last_month" | "last_30_days" | "today" | "month" | "custom";

export const REPORT_PERIOD_OPTIONS: { value: ReportPeriodPreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "today", label: "Today" },
  { value: "month", label: "Select a month" },
  { value: "custom", label: "Custom date range" },
];

/** Inclusive range of business dates as YYYY-MM-DD strings ("" = open end). */
export type ReportDateRange = { start: string; end: string };

export function toIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function monthRange(year: number, monthIndex: number): ReportDateRange {
  return {
    start: toIsoDate(new Date(year, monthIndex, 1)),
    end: toIsoDate(new Date(year, monthIndex + 1, 0)),
  };
}

export function resolveReportRange(
  preset: ReportPeriodPreset,
  options: { today?: Date; month?: string; start?: string; end?: string } = {},
): ReportDateRange {
  const today = options.today ?? new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (preset) {
    case "this_month":
      return monthRange(year, month);
    case "last_month":
      return monthRange(year, month - 1);
    case "last_30_days":
      return {
        start: toIsoDate(new Date(year, month, today.getDate() - 29)),
        end: toIsoDate(today),
      };
    case "today":
      return { start: toIsoDate(today), end: toIsoDate(today) };
    case "month": {
      const match = options.month?.match(/^(\d{4})-(\d{2})$/);
      if (!match) return { start: "", end: "" };
      return monthRange(Number(match[1]), Number(match[2]) - 1);
    }
    case "custom":
      return { start: options.start ?? "", end: options.end ?? "" };
  }
}

export function shipmentBusinessDate(shipment: Shipment) {
  return (shipment.date || shipment.shipmentDate || "").slice(0, 10);
}

export function isInReportRange(shipment: Shipment, range: ReportDateRange) {
  const date = shipmentBusinessDate(shipment);
  if (!date) return !range.start && !range.end;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export type ShipmentReportRow = {
  serial: number;
  shipmentNo: string;
  date: string;
  invoiceNo: string;
  shipmentStatus: string;
  loadingPoint: string;
  destination: string;
  customer: string;
  driverName: string;
  driverPhone: string;
  vehicleNo: string;
  truckType: string;
  companyRate: number;
  driverRate: number;
  gatePass: number;
  fashah: number;
  naql: number;
  otherCharges: number;
  companyAddOn: number;
  driverAddOn: number;
  companyTotal: number;
  driverTotal: number;
  netProfit: number;
  driverAdvance: number;
  driverPaymentStatus: string;
  companyBalance: number;
  invoiceStatus: string;
  companyPaymentStatus: string;
  remarks: string;
};

export type ReportColumnKey = keyof ShipmentReportRow;

export type ReportColumn = {
  key: ReportColumnKey;
  header: string;
  kind: "text" | "number" | "money" | "date";
  /** Excel column width in characters. */
  width: number;
};

export const SHIPMENT_REPORT_COLUMNS: ReportColumn[] = [
  { key: "serial", header: "S.No", kind: "number", width: 6 },
  { key: "shipmentNo", header: "Shipment No", kind: "text", width: 14 },
  { key: "date", header: "Date", kind: "date", width: 12 },
  { key: "invoiceNo", header: "Invoice No", kind: "text", width: 14 },
  { key: "shipmentStatus", header: "Shipment Status", kind: "text", width: 14 },
  { key: "loadingPoint", header: "Loading Point", kind: "text", width: 18 },
  { key: "destination", header: "Destination", kind: "text", width: 18 },
  { key: "customer", header: "Customer", kind: "text", width: 24 },
  { key: "driverName", header: "Driver Name", kind: "text", width: 22 },
  { key: "driverPhone", header: "Driver Phone", kind: "text", width: 16 },
  { key: "vehicleNo", header: "Vehicle No", kind: "text", width: 14 },
  { key: "truckType", header: "Truck Type", kind: "text", width: 14 },
  { key: "companyRate", header: "Company Rate", kind: "money", width: 14 },
  { key: "driverRate", header: "Driver Rate", kind: "money", width: 14 },
  { key: "gatePass", header: "Gate Pass", kind: "money", width: 12 },
  { key: "fashah", header: "Fashah", kind: "money", width: 12 },
  { key: "naql", header: "Naql", kind: "money", width: 12 },
  { key: "otherCharges", header: "Other Charges", kind: "money", width: 14 },
  { key: "companyAddOn", header: "Company Add-on", kind: "money", width: 15 },
  { key: "driverAddOn", header: "Driver Add-on", kind: "money", width: 14 },
  { key: "companyTotal", header: "Company Total", kind: "money", width: 15 },
  { key: "driverTotal", header: "Driver Total", kind: "money", width: 14 },
  { key: "netProfit", header: "Net Profit", kind: "money", width: 14 },
  { key: "driverAdvance", header: "Driver Advance", kind: "money", width: 14 },
  { key: "driverPaymentStatus", header: "Driver Payment Status", kind: "text", width: 18 },
  { key: "companyBalance", header: "Company Balance", kind: "money", width: 15 },
  { key: "invoiceStatus", header: "Invoice Status", kind: "text", width: 14 },
  { key: "companyPaymentStatus", header: "Company Payment Status", kind: "text", width: 18 },
  { key: "remarks", header: "Remarks", kind: "text", width: 36 },
];

const STATUS_LABELS: Record<NonNullable<Shipment["status"]>, string> = {
  pending: "Pending",
  in_transit: "In Transit",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

const EXPENSE_COLUMNS = { gate_pass: "gatePass", fashah: "fashah", naql: "naql" } as const;

function joinUnique(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen].join(" / ");
}

function normalizeCategory(category: string) {
  return category.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function buildShipmentReportRows(
  shipments: Shipment[],
  expenses: ShipmentExpense[],
  drivers: Driver[],
): ShipmentReportRow[] {
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const expensesByShipment = new Map<string, ShipmentExpense[]>();
  for (const expense of expenses) {
    if (expense.deletedAt || !expense.approved) continue;
    const list = expensesByShipment.get(expense.shipmentId) ?? [];
    list.push(expense);
    expensesByShipment.set(expense.shipmentId, list);
  }

  const sorted = [...shipments].sort((a, b) => {
    const byDate = shipmentBusinessDate(a).localeCompare(shipmentBusinessDate(b));
    return byDate !== 0 ? byDate : (a.sr ?? 0) - (b.sr ?? 0);
  });

  return sorted.map((shipment, index) => {
    const legs = shipment.assignments?.length ? shipment.assignments : [];
    const driverIds = legs.length ? legs.map((leg) => leg.driverId) : [shipment.driverId];
    const legDrivers = driverIds.map((id) => (id ? driversById.get(id) : undefined));

    const charges = { gatePass: 0, fashah: 0, naql: 0, otherCharges: 0 };
    for (const expense of expensesByShipment.get(shipment.id) ?? []) {
      const column = EXPENSE_COLUMNS[normalizeCategory(String(expense.category)) as keyof typeof EXPENSE_COLUMNS] ?? "otherCharges";
      charges[column] = sumMoney([charges[column], getExpenseDisplayAmount(expense)]);
    }

    const companyRate = roundMoney(shipment.companyRate);
    const driverRate = roundMoney(shipment.driverRate);
    const companyTotal = roundMoney(shipment.companyTotal);
    const driverTotal = roundMoney(shipment.driverTotal);
    const netProfit = roundMoney(shipment.netProfit);

    return {
      serial: index + 1,
      shipmentNo: shipment.shipmentNo || String(shipment.sr ?? ""),
      date: shipmentBusinessDate(shipment),
      invoiceNo: shipment.invoiceReference || shipment.invoice || "",
      shipmentStatus: shipment.status ? STATUS_LABELS[shipment.status] : "",
      loadingPoint: shipment.loadingPoint ?? "",
      destination: shipment.destination ?? "",
      customer: shipment.customer || shipment.clientName || "",
      driverName: legs.length ? joinUnique(legs.map((leg) => leg.driverName)) : shipment.driverName ?? "",
      driverPhone: joinUnique([shipment.cellNo, ...legDrivers.map((driver) => driver?.phone)]),
      vehicleNo: legs.length
        ? joinUnique(legs.map((leg) => leg.vehicleNo)) || shipment.vehicleNo || ""
        : shipment.vehicleNo || shipment.vehicleNumber || "",
      truckType: legs.length
        ? joinUnique(legs.map((leg) => leg.truckType)) || shipment.truckType || ""
        : shipment.truckType || shipment.truckTypeName || "",
      companyRate,
      driverRate,
      ...charges,
      companyAddOn: roundMoney(companyTotal - companyRate),
      driverAddOn: roundMoney(driverTotal - driverRate),
      companyTotal,
      driverTotal,
      netProfit,
      driverAdvance: roundMoney(shipment.advance),
      driverPaymentStatus: shipment.driverPaymentStatus ?? "",
      companyBalance: roundMoney(shipment.clientBalance ?? 0),
      invoiceStatus: shipment.invoiceStatus ?? "",
      companyPaymentStatus: shipment.clientPaymentStatus ?? "",
      remarks: shipment.remarks ?? "",
    };
  });
}

export type ReportTotals = Partial<Record<ReportColumnKey, number>>;

export function totalReportRows(rows: ShipmentReportRow[]): ReportTotals {
  const totals: ReportTotals = {};
  for (const column of SHIPMENT_REPORT_COLUMNS) {
    if (column.kind !== "money") continue;
    totals[column.key] = sumMoney(rows.map((row) => row[column.key] as number));
  }
  return totals;
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildShipmentReportCsv(rows: ShipmentReportRow[], columns = SHIPMENT_REPORT_COLUMNS) {
  const totals = totalReportRows(rows);
  const lines = [columns.map((column) => csvCell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column.key])).join(","));
  }
  if (rows.length) {
    lines.push(
      columns
        .map((column, index) => {
          if (index === 0) return "TOTAL";
          const total = totals[column.key];
          return total === undefined ? "" : csvCell(total);
        })
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export function reportFileName(range: ReportDateRange, extension: "csv" | "xlsx") {
  const label = range.start && range.end
    ? range.start === range.end ? range.start : `${range.start}_to_${range.end}`
    : range.start ? `from_${range.start}` : range.end ? `until_${range.end}` : "all_time";
  return `shipment-report_${label}.${extension}`;
}
