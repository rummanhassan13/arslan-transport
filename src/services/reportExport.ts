import type { CellObject, Row, SheetData } from "write-excel-file/browser";
import {
  SHIPMENT_REPORT_COLUMNS,
  buildShipmentReportCsv,
  reportFileName,
  totalReportRows,
  type ReportDateRange,
  type ShipmentReportRow,
} from "../domain/shipmentReport";

/** Only the period is needed now: it names the downloaded file. */
export type ShipmentReportMeta = {
  range: ReportDateRange;
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
  // Keep the URL alive long enough for slow "Save as" dialogs / embedded browsers to fetch it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

/**
 * One flat table, like the shipment register: the header on row 1, then one row per shipment, then a totals row.
 * No title or per-company summary block above it, so the sheet sorts and filters cleanly.
 */
export function buildShipmentReportSheet(rows: ShipmentReportRow[]): SheetData {
  const columns = SHIPMENT_REPORT_COLUMNS;
  const totals = totalReportRows(rows);

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

  return [header, ...body, ...(rows.length ? [totalRow] : [])];
}

export async function downloadShipmentReportXlsx(rows: ShipmentReportRow[], meta: ShipmentReportMeta) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const data = buildShipmentReportSheet(rows);
  const blob = await writeXlsxFile(data, {
    sheet: "Shipments",
    columns: SHIPMENT_REPORT_COLUMNS.map((column) => ({ width: column.width })),
    // Keep the header row and the date / shipment columns visible while scrolling.
    stickyRowsCount: 1,
    stickyColumnsCount: 3,
  }, { fontFamily: "Calibri", fontSize: 11 }).toBlob();
  downloadBlob(blob, reportFileName(meta.range, "xlsx"));
}
