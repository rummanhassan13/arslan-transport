// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = { role: "owner" as string, activeOrganization: { id: "org-1", name: "Arslan Transport", slug: "arslan", status: "active" } };

vi.mock("../config/env", () => ({ env: { demoMode: false }, getMissingSupabaseEnvVars: () => [] }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("../hooks/useBusinessSettings", () => ({ useBusinessSettings: () => ({ company: {}, invoice: {} }) }));
vi.mock("../hooks/useCurrency", () => ({ useCurrency: () => ({ currencies: [], currencyCode: "AED", setCurrencyCode: vi.fn() }) }));

const service = vi.hoisted(() => ({
  listPendingAccessRequests: vi.fn(),
  approveAccessRequest: vi.fn(),
  rejectAccessRequest: vi.fn(),
}));
vi.mock("../services/accessRequestService", () => ({
  APPROVABLE_ROLES: ["viewer", "dispatcher", "accountant", "manager", "admin"],
  ...service,
}));

import { SettingsPanel } from "./Header";

const pending = {
  id: "req-1",
  userId: "user-9",
  email: "new.person@example.com",
  fullName: "New Person",
  companyName: "Arslan Transport",
  phone: null,
  message: "I handle dispatch",
  status: "pending",
  createdAt: "2026-11-12T08:00:00Z",
};

describe("User & Roles access requests", () => {
  beforeEach(() => {
    authState.role = "owner";
    service.listPendingAccessRequests.mockResolvedValue([pending]);
    service.approveAccessRequest.mockResolvedValue(undefined);
    service.rejectAccessRequest.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lets an owner approve a pending request with the chosen role", async () => {
    render(<SettingsPanel panel="User & Roles" orgName="Arslan Transport" onClose={vi.fn()} />);

    expect(await screen.findByText("New Person")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Role for new.person@example.com"), { target: { value: "dispatcher" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(service.approveAccessRequest).toHaveBeenCalledWith("req-1", "org-1", "dispatcher"));
    await waitFor(() => expect(screen.queryByText("New Person")).not.toBeInTheDocument());
  });

  it("lets an owner reject a request", async () => {
    render(<SettingsPanel panel="User & Roles" orgName="Arslan Transport" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    await waitFor(() => expect(service.rejectAccessRequest).toHaveBeenCalledWith("req-1"));
  });

  it("does not offer the admin role to an admin", async () => {
    authState.role = "admin";
    render(<SettingsPanel panel="User & Roles" orgName="Arslan Transport" onClose={vi.fn()} />);

    const select = await screen.findByLabelText("Role for new.person@example.com");
    expect(Array.from((select as HTMLSelectElement).options).map((option) => option.value)).not.toContain("admin");
  });

  it("hides access requests from other roles", async () => {
    authState.role = "dispatcher";
    render(<SettingsPanel panel="User & Roles" orgName="Arslan Transport" onClose={vi.fn()} />);

    expect(screen.queryByText("Access requests")).not.toBeInTheDocument();
    expect(service.listPendingAccessRequests).not.toHaveBeenCalled();
  });
});
