// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientPayment, Invoice, Shipment } from "../types/domain";
import { PaymentsPage } from "./PaymentsPage";

function invoice(id: string, invoiceNumber: string, shipmentId: string): Invoice {
  return {
    id,
    organizationId: "org-1",
    invoiceNumber,
    invoicePrefix: null,
    shipmentId,
    clientId: "client-1",
    issueDate: "2026-11-18",
    dueDate: null,
    status: "sent",
    clientSnapshot: { name: "MOMIN" },
    shipmentSnapshot: {},
    subtotal: 5200,
    expenseTotal: 0,
    totalAmount: 5200,
    notes: null,
    createdAt: "2026-11-18",
    updatedAt: "2026-11-18",
    deletedAt: null,
    clientName: "MOMIN",
  } as Invoice;
}

function payment(id: string, invoiceId: string, shipmentId: string, invoiceNumber?: string): ClientPayment {
  return {
    id,
    organizationId: "org-1",
    invoiceId,
    clientId: "client-1",
    shipmentId,
    amount: 5200,
    direction: 1,
    paymentDate: "2026-11-18",
    paymentMethod: null,
    referenceNo: null,
    notes: null,
    createdAt: "2026-11-18",
    updatedAt: "2026-11-18",
    deletedAt: null,
    clientName: "MOMIN",
    invoiceNumber: invoiceNumber ?? null,
  };
}

const shipments = [
  { id: "s1", invoice: "SHP-501", customer: "MOMIN", pending: 0 },
  { id: "s2", invoice: "SHP-502", customer: "MOMIN", pending: 0 },
] as unknown as Shipment[];
const invoices = [invoice("i1", "INV-1001", "s1"), invoice("i2", "INV-1002", "s2")];
// The second payment has no joined invoice number, so it must be looked up from the invoice list.
const clientPayments = [payment("p1", "i1", "s1", "INV-1001"), payment("p2", "i2", "s2")];

function historyTable() {
  const card = screen.getByText("Company Payments History").closest(".table-card") as HTMLElement;
  return within(card);
}

describe("PaymentsPage company payments history", () => {
  afterEach(() => cleanup());

  it("shows the invoice and shipment of each payment", () => {
    render(<PaymentsPage shipments={shipments} invoices={invoices} clientPayments={clientPayments} openPayment={() => {}} embedded />);
    const history = historyTable();
    expect(history.getByText("Invoice")).toBeInTheDocument();
    expect(history.getByText("Shipment")).toBeInTheDocument();
    expect(history.getByText("INV-1001")).toBeInTheDocument();
    expect(history.getByText("INV-1002")).toBeInTheDocument();
    expect(history.getByText("SHP-501")).toBeInTheDocument();
    expect(history.getByText("SHP-502")).toBeInTheDocument();
  });

  it("filters payments and receivables by invoice or shipment number", () => {
    render(<PaymentsPage shipments={shipments} invoices={invoices} clientPayments={clientPayments} openPayment={() => {}} embedded />);
    const search = screen.getByLabelText("Search payments");

    fireEvent.change(search, { target: { value: "inv-1002" } });
    expect(historyTable().queryByText("INV-1001")).not.toBeInTheDocument();
    expect(historyTable().getByText("INV-1002")).toBeInTheDocument();
    expect(screen.getByText("1 rows")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "SHP-501" } });
    expect(historyTable().getByText("INV-1001")).toBeInTheDocument();
    expect(historyTable().queryByText("INV-1002")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "nothing-matches" } });
    expect(screen.getByText("No company payments match the current search.")).toBeInTheDocument();
  });
});
