import { useEffect, useState, useRef } from "react";
import { CalendarDays, ArrowRight, Check } from "lucide-react";
import { api } from "../api.js";
export default function AuthScreen({ onAuth, initialMode = "register" }) {
  const [mode, setMode] = useState(initialMode),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [site, setSite] = useState(null),
    [timeZone, setTimeZone] = useState("Asia/Dhaka");
  const zoneEdited = useRef(false);
  useEffect(() => {
    let active = true;
    api("/public/settings")
      .then((data) => {
        if (active) {
          setSite(data);
          if (!zoneEdited.current) setTimeZone(data.defaultTimeZone);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const register = mode === "register",
    forgot = mode === "forgot";
  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await api(
        `/auth/${forgot ? "forgot-password" : register ? "register" : "login"}`,
        {
          method: "POST",
          body,
        },
      );
      if (forgot) setMessage(data.message);
      else onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-icon">
            <CalendarDays size={25} />
          </span>
          Planora
        </div>
        <div>
          <span className="eyebrow">
            A little structure. A lot more possibility.
          </span>
          <h1>
            Make room for
            <br />
            what matters.
          </h1>
          <p>
            Your day doesn’t happen in neat hourly boxes.
            <br />
            Plan it on your own terms, down to the minute.
          </p>
          <div className="sample-day">
            <div className="sample-time">09:15</div>
            <div className="sample-task">
              <b>CascadeVLM · Deep work</b>
              <span>9:15 AM – 9:55 AM · Study</span>
            </div>
            <div className="sample-time">10:10</div>
            <div className="sample-task green">
              <b>A moment to recharge</b>
              <span>10:10 AM – 10:35 AM · Health</span>
            </div>
          </div>
          <div className="auth-benefits">
            <span>
              <Check size={16} />
              Exact custom times
            </span>
            <span>
              <Check size={16} />A home for unfinished ideas
            </span>
          </div>
        </div>
        <small>Your day, your time.</small>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow">LET’S GET YOU ORGANISED</span>
          <h2>
            {forgot
              ? "Let’s get you back in."
              : register
                ? "Your next chapter starts here."
                : "Welcome back."}
          </h2>
          <p>
            {forgot
              ? "Enter your account email to request a password reset link."
              : register
                ? "Create your personal planning space."
                : "Pick up where your day left off."}
          </p>
          {register && (
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={80}
                placeholder="Shawon Hossain"
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>
          {!forgot && (
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={8}
                maxLength={72}
                placeholder="At least 8 characters"
              />
            </label>
          )}
          {register && (
            <label>
              Planner timezone
              <input
                name="timeZone"
                value={timeZone}
                onChange={(e) => {
                  zoneEdited.current = true;
                  setTimeZone(e.target.value);
                }}
                required
                list="timezones"
              />
              <datalist id="timezones">
                <option value="Asia/Dhaka" />
                <option value="UTC" />
                <option value="Europe/Berlin" />
                <option value="America/New_York" />
              </datalist>
              <small>Use an IANA timezone, such as Asia/Dhaka.</small>
            </label>
          )}
          {register && site?.registrationOpen === false && (
            <div className="alert warning">
              New account registration is currently closed. Existing users can
              sign in.
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="alert success" role="status">
              {message}
            </div>
          )}
          <button
            className="button primary full"
            disabled={busy || (register && site?.registrationOpen === false)}
          >
            {busy
              ? "Please wait…"
              : forgot
                ? "Send reset link"
                : register
                  ? "Create account"
                  : "Sign in"}
            <ArrowRight size={18} />
          </button>
          <p className="auth-switch">
            {forgot
              ? "Remember your password?"
              : register
                ? "Already have an account?"
                : "New to Planora?"}{" "}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setMode(forgot || register ? "login" : "register");
                setError("");
                setMessage("");
              }}
            >
              {forgot || register ? "Sign in" : "Create account"}
            </button>
          </p>
          {!register && !forgot && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setMode("forgot");
                setError("");
                setMessage("");
              }}
            >
              Forgot password?
            </button>
          )}
          <small className="muted">Planora v0.8.1 · Your day, your time.</small>
        </form>
      </section>
    </main>
  );
}
