import { describe, expect, it } from "vitest";
import type { Driver, Shipment, ShipmentExpense } from "../types/domain";
import {
  buildShipmentReportCsv,
  buildShipmentReportRows,
  isInReportRange,
  reportFileName,
  resolveReportRange,
  totalReportRows,
} from "./shipmentReport";

function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "shipment-1",
    sr: 1,
    shipmentNo: "SHP-001",
    date: "2026-04-10",
    invoice: "INV-001",
    driverId: "driver-1",
    status: "in_transit",
    loadingPoint: "Jebel Ali",
    destination: "Abu Dhabi",
    customer: "Acme, LLC",
    driverName: "Driver One",
    vehicleNo: "DXB-1",
    truckType: "Flatbed",
    cellNo: "050111",
    companyRate: 1000,
    driverRate: 600,
    advance: 100,
    gatePass: 0,
    fashah: 0,
    naql: 0,
    companyTotal: 1150,
    driverTotal: 650,
    pending: 550,
    netProfit: 450,
    driverPaymentStatus: "Advance Paid",
    invoiceStatus: "Draft",
    clientPaymentStatus: "Pending",
    remarks: 'Said "urgent"',
    billImages: [],
    ...overrides,
  };
}

function expense(overrides: Partial<ShipmentExpense>): ShipmentExpense {
  return {
    id: "expense-1",
    organizationId: "org-1",
    shipmentId: "shipment-1",
    category: "gate_pass",
    amount: 100,
    paidBy: "company",
    clientBillable: true,
    driverReimbursable: false,
    approved: true,
    includedInInvoice: true,
    expenseDate: "2026-04-10",
    notes: null,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    ...overrides,
  };
}

const driver: Driver = {
  id: "driver-1",
  organizationId: "org-1",
  name: "Driver One",
  phone: "050222",
  cnic: "784-1",
  licenseNumber: "LIC-9",
  providerName: "Own",
  notes: null,
  status: "active",
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
};

describe("resolveReportRange", () => {
  const today = new Date(2026, 2, 15); // 15 Mar 2026

  it("resolves calendar presets", () => {
    expect(resolveReportRange("this_month", { today })).toEqual({ start: "2026-03-01", end: "2026-03-31" });
    expect(resolveReportRange("last_month", { today })).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(resolveReportRange("last_30_days", { today })).toEqual({ start: "2026-02-14", end: "2026-03-15" });
    expect(resolveReportRange("today", { today })).toEqual({ start: "2026-03-15", end: "2026-03-15" });
  });

  it("rolls last month back across a year boundary", () => {
    expect(resolveReportRange("last_month", { today: new Date(2026, 0, 5) })).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("resolves a selected month and custom range", () => {
    expect(resolveReportRange("month", { month: "2024-02" })).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(resolveReportRange("custom", { start: "2026-01-01", end: "2026-01-10" })).toEqual({ start: "2026-01-01", end: "2026-01-10" });
  });

  it("filters inclusively on the shipment date", () => {
    const range = { start: "2026-04-01", end: "2026-04-30" };
    expect(isInReportRange(shipment({ date: "2026-04-30" }), range)).toBe(true);
    expect(isInReportRange(shipment({ date: "2026-05-01" }), range)).toBe(false);
  });
});

describe("buildShipmentReportRows", () => {
  const rows = buildShipmentReportRows(
    [shipment()],
    [
      expense({ category: "gate_pass", amount: 100 }),
      expense({ id: "e2", category: "Fashah", amount: 50 }),
      expense({ id: "e3", category: "fuel", amount: 25, clientBillable: false }),
      expense({ id: "e4", category: "naql", amount: 999, approved: false }),
    ],
    [driver],
  );
  const row = rows[0];

  it("breaks charges out by category and skips unapproved expenses", () => {
    expect(row.gatePass).toBe(100);
    expect(row.fashah).toBe(50);
    expect(row.otherCharges).toBe(25);
    expect(row.naql).toBe(0);
  });

  it("derives add-ons and other costs that reconcile with net profit", () => {
    expect(row.companyAddOn).toBe(150);
    expect(row.driverAddOn).toBe(50);
    expect(row.otherCosts).toBe(50);
    expect(row.companyTotal - row.driverTotal - row.otherCosts).toBe(row.netProfit);
  });

  it("pulls driver details from the driver directory", () => {
    expect(row.driverPhone).toBe("050111 / 050222");
    expect(row.driverCnic).toBe("784-1");
    expect(row.driverLicense).toBe("LIC-9");
    expect(row.shipmentStatus).toBe("In Transit");
  });

  it("totals money columns", () => {
    const totals = totalReportRows([row, { ...row, companyTotal: 50 }]);
    expect(totals.companyTotal).toBe(1200);
    expect(totals.serial).toBeUndefined();
  });
});

describe("CSV export", () => {
  it("quotes values with commas and quotes and appends a total row", () => {
    const csv = buildShipmentReportCsv(buildShipmentReportRows([shipment()], [], [driver]));
    const lines = csv.split("\r\n");
    expect(lines[0].startsWith("S.No,Shipment No,Date")).toBe(true);
    expect(lines[1]).toContain('"Acme, LLC"');
    expect(lines[1]).toContain('"Said ""urgent"""');
    expect(lines[2].startsWith("TOTAL,")).toBe(true);
  });

  it("names files after the period", () => {
    expect(reportFileName({ start: "2026-04-01", end: "2026-04-30" }, "xlsx")).toBe("shipment-report_2026-04-01_to_2026-04-30.xlsx");
    expect(reportFileName({ start: "", end: "" }, "csv")).toBe("shipment-report_all_time.csv");
  });
});
