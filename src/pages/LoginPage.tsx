import { useState, type FormEvent } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { signUpForAccess } from "../services/accessRequestService";

const MIN_PASSWORD_LENGTH = 12;

type Mode = "signIn" | "requestAccess";

export function LoginPage({
  onSignIn,
  loading,
  initialError,
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  loading: boolean;
  initialError?: string | null;
}) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const disabled = loading || submitting || Boolean(initialError);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  const submitSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      await onSignIn(email, password);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in.");
    }
  };

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const signedIn = await signUpForAccess(email.trim(), password, { fullName, companyName, phone, message });
      if (!signedIn) {
        setMode("signIn");
        setPassword("");
        setConfirmPassword("");
        setNotice("Check your email and click the confirmation link, then sign in here. Your request goes to the administrator, who must approve it before you can use the workspace.");
      }
      // When already signed in, the app moves on to the "waiting for approval" screen by itself.
    } catch (signUpError) {
      setError(signUpError instanceof Error ? signUpError.message : "Unable to send your request.");
    } finally {
      setSubmitting(false);
    }
  };

  const requesting = mode === "requestAccess";

  return (
    <main className="auth-shell auth-shell-login">
      <section className="auth-story" aria-label="TransportFlow overview">
        <div className="v2-brand">
          <span className="v2-brand-mark">TF</span>
          <span className="v2-brand-copy"><strong>TransportFlow</strong><small>Transport operations</small></span>
        </div>
        <div className="auth-story-copy">
          <span>One organized workspace</span>
          <h2>Keep every shipment, payment, and document in view.</h2>
          <p>Built for transport teams replacing scattered spreadsheets with a clear daily workflow.</p>
        </div>
        <div className="auth-story-points">
          <span>Shipment operations</span>
          <span>Driver settlements</span>
          <span>Company receivables</span>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">TF</span>
          <div>
            <p>{requesting ? "New account" : "Welcome back"}</p>
            <h1>{requesting ? "Request access" : "Sign in to your workspace"}</h1>
          </div>
        </div>

        <p className="auth-note">
          {requesting
            ? "Create your login. An administrator reviews every request and gives you access before you can use the workspace."
            : "Use the account provided by your organization administrator."}
        </p>

        <form className="auth-form" onSubmit={requesting ? submitRequest : submitSignIn}>
          {requesting && (
            <>
              <label className="field">
                <span>Full name</span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" maxLength={120} disabled={disabled} required />
              </label>
              <label className="field">
                <span>Company</span>
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} autoComplete="organization" maxLength={160} disabled={disabled} />
              </label>
              <label className="field">
                <span>Phone</span>
                <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" maxLength={40} disabled={disabled} />
              </label>
            </>
          )}

          <label className="field">
            <span>Email</span>
            <div className="field-with-icon">
              <Mail size={15} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@company.com"
                autoComplete="email"
                disabled={disabled}
                required
              />
            </div>
          </label>

          <label className="field">
            <span>Password</span>
            <div className="field-with-icon">
              <LockKeyhole size={15} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={requesting ? `At least ${MIN_PASSWORD_LENGTH} characters` : "Password"}
                autoComplete={requesting ? "new-password" : "current-password"}
                minLength={requesting ? MIN_PASSWORD_LENGTH : undefined}
                disabled={disabled}
                required
              />
            </div>
          </label>

          {requesting && (
            <>
              <label className="field">
                <span>Confirm password</span>
                <div className="field-with-icon">
                  <LockKeyhole size={15} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={disabled}
                    required
                  />
                </div>
              </label>
              <label className="field">
                <span>Note for the administrator (optional)</span>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} rows={2} disabled={disabled} />
              </label>
            </>
          )}

          {notice && <p className="auth-note" role="status">{notice}</p>}

          {(initialError || error) && (
            <p className="form-error">
              {initialError || error}
            </p>
          )}

          <button className="btn-primary auth-submit" type="submit" disabled={disabled}>
            {requesting
              ? submitting ? "Sending request..." : "Request Access"
              : loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="auth-note auth-switch">
          {requesting ? "Already approved? " : "New to the workspace? "}
          <button className="table-action" type="button" onClick={() => switchMode(requesting ? "signIn" : "requestAccess")} disabled={submitting}>
            {requesting ? "Sign in" : "Request access"}
          </button>
        </p>
      </section>
    </main>
  );
}
