import { useState } from "react";
import { api } from "../api.js";
export default function VerificationScreen({ token, onBack }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function verify() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/verify-email", { method: "POST", body: { token } });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="loading-screen">
      <div className="verification-card">
        <span className="eyebrow">PLANORA ACCOUNT</span>
        <h1>{done ? "Email verified" : "Verify your email"}</h1>
        <p>
          {done
            ? "Your current account email has been verified."
            : "Confirm that you want to verify the email address associated with this link."}
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {!done && (
          <button className="button primary" disabled={busy} onClick={verify}>
            {busy ? "Verifying…" : "Verify email"}
          </button>
        )}
        <button className="text-button" disabled={busy} onClick={onBack}>
          Return to Planora
        </button>
      </div>
    </main>
  );
}
