import type { CellObject, Row, SheetData } from "write-excel-file/browser";
import {
  SHIPMENT_REPORT_COLUMNS,
  buildShipmentReportCsv,
  reportFileName,
  totalReportRows,
  type ReportDateRange,
  type ShipmentReportRow,
} from "../domain/shipmentReport";
import { getStoredCurrencyCode } from "../utils/formatters";

export type ShipmentReportMeta = {
  range: ReportDateRange;
  periodLabel: string;
  customer: string;
};

const MONEY_FORMAT = "#,##0.00";
const DATE_FORMAT = "dd-mmm-yyyy";
const HEADER_FILL = "#1F3A5F";
const TOTAL_FILL = "#E8EEF5";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadShipmentReportCsv(rows: ShipmentReportRow[], meta: ShipmentReportMeta) {
  // BOM so Excel opens the UTF-8 file (Arabic names, "–") correctly.
  const blob = new Blob(["﻿", buildShipmentReportCsv(rows)], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, reportFileName(meta.range, "csv"));
}

/** Excel stores dates without a timezone; build them in UTC so the day never shifts. */
function excelDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

function dataCell(row: ShipmentReportRow, column: (typeof SHIPMENT_REPORT_COLUMNS)[number]): CellObject {
  const value = row[column.key];
  if (column.kind === "money") return { value: Number(value), type: Number, format: MONEY_FORMAT };
  if (column.kind === "number") return { value: Number(value), type: Number, align: "center" };
  if (column.kind === "date") {
    const date = excelDate(String(value));
    return date ? { value: date, type: Date, format: DATE_FORMAT } : { value: String(value), type: String };
  }
  return { value: String(value ?? ""), type: String };
}

export function buildShipmentReportSheet(rows: ShipmentReportRow[], meta: ShipmentReportMeta): SheetData {
  const columns = SHIPMENT_REPORT_COLUMNS;
  const span = columns.length;
  const totals = totalReportRows(rows);
  const generated = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const metaRow = (label: string, value: string): Row => [
    { value: label, type: String, fontWeight: "bold" },
    { value, type: String, columnSpan: span - 1 },
  ];

  const header: Row = columns.map((column) => ({
    value: column.header,
    type: String,
    fontWeight: "bold",
    textColor: "#FFFFFF",
    backgroundColor: HEADER_FILL,
    align: "center",
    alignVertical: "center",
    wrap: true,
    height: 32,
    borderStyle: "thin",
    borderColor: "#9AA9BC",
  }));

  const body: Row[] = rows.map((row) => columns.map((column) => dataCell(row, column)));

  const totalRow: Row = columns.map((column, index) => {
    const base: CellObject = { fontWeight: "bold", backgroundColor: TOTAL_FILL, topBorderStyle: "thin", topBorderColor: "#1F3A5F" };
    if (index === 0) return { ...base, value: "TOTAL", type: String };
    const total = totals[column.key];
    return total === undefined ? base : { ...base, value: total, type: Number, format: MONEY_FORMAT };
  });

  return [
    [{ value: "ARSLAN TRANSPORTATION L.L.C — SHIPMENT REPORT", type: String, fontWeight: "bold", fontSize: 14, columnSpan: span }],
    metaRow("Period", meta.periodLabel),
    metaRow("Company", meta.customer),
    metaRow("Shipments", String(rows.length)),
    metaRow("Currency", getStoredCurrencyCode()),
    metaRow("Generated", generated),
    [],
    header,
    ...body,
    ...(rows.length ? [totalRow] : []),
  ];
}

/** Rows above the table header, plus the header itself (kept visible while scrolling). */
const STICKY_ROWS = 8;

export async function downloadShipmentReportXlsx(rows: ShipmentReportRow[], meta: ShipmentReportMeta) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const data = buildShipmentReportSheet(rows, meta);
  const blob = await writeXlsxFile(data, {
    sheet: "Shipments",
    columns: SHIPMENT_REPORT_COLUMNS.map((column) => ({ width: column.width })),
    stickyRowsCount: STICKY_ROWS,
    stickyColumnsCount: 3,
  }, { fontFamily: "Calibri", fontSize: 11 }).toBlob();
  downloadBlob(blob, reportFileName(meta.range, "xlsx"));
}
