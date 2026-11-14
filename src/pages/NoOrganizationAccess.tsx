import { useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { submitOwnAccessRequest, type AccessRequest } from "../services/accessRequestService";

// Shown to a signed-in user who has no organization yet. It records their access request
// (once) so an owner/admin can approve it, and lets them check again.
export function NoOrganizationAccess({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const { user, refreshAuthContext } = useAuth();
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    submitOwnAccessRequest(user.user_metadata)
      .then((next) => {
        if (!cancelled) setRequest(next);
      })
      .catch(() => {
        if (!cancelled) setRequestFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const checkAgain = useCallback(async () => {
    setChecking(true);
    try {
      await refreshAuthContext(false);
    } finally {
      setChecking(false);
    }
  }, [refreshAuthContext]);

  const rejected = request?.status === "rejected";
  const title = rejected ? "Access not approved" : request ? "Waiting for approval" : "No organization linked";
  const note = rejected
    ? "An administrator reviewed your request and did not approve it. Contact your organization administrator if you think this is a mistake."
    : request
      ? `Your request${user?.email ? ` for ${user.email}` : ""} has been sent. An administrator must approve it before you can use the workspace.`
      : requestFailed
        ? "Your account is active, but it is not linked to an organization yet. Contact your organization administrator."
        : "Your account is active, but it is not linked to an organization yet.";

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-center">
        <span className="auth-icon">
          <Building2 size={24} />
        </span>
        <p className="auth-eyebrow">Organization Access</p>
        <h1>{title}</h1>
        <p className="auth-note">{note}</p>
        {request && !rejected && (
          <button className="btn-ghost auth-submit" onClick={() => void checkAgain()} disabled={checking}>
            {checking ? "Checking..." : "Check again"}
          </button>
        )}
        <button className="btn-primary auth-submit" onClick={() => void onSignOut()}>
          Account / Logout
        </button>
      </section>
    </main>
  );
}
