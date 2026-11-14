import { requireSupabaseClient } from "../lib/supabase";
import type { Role } from "../constants/roles";

// Sign-up with manual approval. A new login has no access until an owner/admin
// approves its request and picks a role (see supabase/migrations/025_security_hardening.sql).

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type AccessRequest = {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  companyName: string | null;
  phone: string | null;
  message: string | null;
  status: AccessRequestStatus;
  createdAt: string;
};

export type SignUpDetails = {
  fullName: string;
  companyName: string;
  phone: string;
  message: string;
};

export type ApprovableRole = Exclude<Role, "owner">;
export const APPROVABLE_ROLES: ApprovableRole[] = ["viewer", "dispatcher", "accountant", "manager", "admin"];

type AccessRequestRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  message: string | null;
  status: AccessRequestStatus;
  created_at: string;
};

function toAccessRequest(row: AccessRequestRow): AccessRequest {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    companyName: row.company_name,
    phone: row.phone,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

function appRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/app/`;
}

/** Creates the login. Returns true when the user is already signed in (email confirmation is off). */
export async function signUpForAccess(email: string, password: string, details: SignUpDetails): Promise<boolean> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: appRedirectUrl(),
      data: {
        full_name: details.fullName.trim(),
        company_name: details.companyName.trim(),
        phone: details.phone.trim(),
        access_message: details.message.trim(),
      },
    },
  });
  if (error) throw error;
  return Boolean(data.session);
}

function metadataText(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Records (or returns) the signed-in user's access request, using the details given at sign-up. */
export async function submitOwnAccessRequest(metadata: Record<string, unknown> | undefined): Promise<AccessRequest> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.rpc("request_access", {
    p_full_name: metadataText(metadata, "full_name"),
    p_company_name: metadataText(metadata, "company_name"),
    p_phone: metadataText(metadata, "phone"),
    p_message: metadataText(metadata, "access_message"),
  });
  if (error) throw error;
  return toAccessRequest(data as AccessRequestRow);
}

export async function listPendingAccessRequests(): Promise<AccessRequest[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.rpc("list_access_requests");
  if (error) throw error;
  return ((data ?? []) as AccessRequestRow[]).map(toAccessRequest);
}

export async function approveAccessRequest(requestId: string, organizationId: string, role: ApprovableRole): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.rpc("approve_access_request", {
    p_request_id: requestId,
    p_organization_id: organizationId,
    p_role: role,
  });
  if (error) throw error;
}

export async function rejectAccessRequest(requestId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.rpc("reject_access_request", { p_request_id: requestId });
  if (error) throw error;
}
