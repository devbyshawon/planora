import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { api } from "../api.js";
export default function ResetPasswordScreen({ token, onBack }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (body.newPassword !== body.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: { token, newPassword: body.newPassword },
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="reset-shell">
      <section className="reset-card">
        <span className="brand-icon">
          <LockKeyhole size={24} />
        </span>
        <span className="eyebrow">PLANORA · ACCOUNT RECOVERY</span>
        <h1>{success ? "A fresh start." : "Choose a new password."}</h1>
        {success ? (
          <>
            <p>
              Your password has been updated and your previous sessions are
              signed out.
            </p>
            <button className="button primary" onClick={onBack}>
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted">
              Recovery links expire after 15 minutes and can be used once.
            </p>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                autoFocus
              />
            </label>
            <label>
              Confirm new password
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
              />
            </label>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Updating…" : "Reset password"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={onBack}
            >
              Back to sign in
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
