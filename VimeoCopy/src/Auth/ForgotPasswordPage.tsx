import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { PasswordField } from "./PasswordField";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";

type Step = "email" | "code" | "password";

const CODE_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;

/** mm:ss for the code countdown. */
function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Three-step password recovery: request a code → verify it → set a new password.
 * The code is deliberately verified on its own step so an expired or mistyped one is
 * reported before the user has bothered choosing a password.
 */
export function ForgotPasswordPage() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Deadlines are absolute so the countdown stays honest across a backgrounded tab.
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [resendAllowedAt, setResendAllowedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Only tick while a countdown is on screen.
  useEffect(() => {
    if (step !== "code") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const secondsLeft = codeExpiresAt ? Math.max(0, Math.ceil((codeExpiresAt - now) / 1000)) : 0;
  const resendInSeconds = resendAllowedAt ? Math.max(0, Math.ceil((resendAllowedAt - now) / 1000)) : 0;
  const codeExpired = step === "code" && secondsLeft === 0;

  async function parseMessage(res: Response, fallback: string) {
    try {
      const data = await res.json();
      return data.message || data.error || fallback;
    } catch {
      return fallback;
    }
  }

  const sendCode = useCallback(
    async (targetEmail: string, isResend: boolean) => {
      setError("");
      setLoading(true);

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: targetEmail }),
        });

        if (res.status === 429) {
          setError("Too many requests. Please wait a minute and try again.");
          return;
        }

        if (!res.ok) {
          setError(await parseMessage(res, "Could not send the code. Please try again."));
          return;
        }

        const data = await res.json();
        const startedAt = Date.now();

        setCodeExpiresAt(startedAt + (data.expiresInSeconds ?? 120) * 1000);
        setResendAllowedAt(startedAt + (data.resendAfterSeconds ?? 60) * 1000);
        setNow(startedAt);
        setCode("");
        setStep("code");

        // Same wording whether or not the address is registered — the API won't tell us either.
        toast.success(
          isResend
            ? "A new code is on its way."
            : "If an account exists for that email, we've sent a code."
        );
      } catch {
        setError("Could not reach the server. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    await sendCode(email, false);
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-reset-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });

      if (!res.ok) {
        setError(await parseMessage(res, "That code is invalid or has expired."));
        return;
      }

      const data = await res.json();
      setTicket(data.ticket);
      setStep("password");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, ticket, newPassword: password }),
      });

      if (!res.ok) {
        setError(await parseMessage(res, "Could not update the password."));
        return;
      }

      const data = await res.json();

      // The API already set the refresh cookie; adopting the access token signs us straight in.
      loginWithToken(data.accessToken);
      toast.success("Password updated — you're signed in.");
      navigate("/profile", { replace: true });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    setStep("email");
    setCode("");
    setTicket("");
    setPassword("");
    setConfirmPassword("");
    setCodeExpiresAt(null);
    setResendAllowedAt(null);
    setError("");
  }

  const steps: { key: Step; label: string }[] = [
    { key: "email", label: "Your email" },
    { key: "code", label: "Verify code" },
    { key: "password", label: "New password" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="container reset-container">
      <div className="card reset-card">
        <div className="card-header">
          <h1 className="card-title">Reset your password</h1>
          <p className="reset-subtitle">
            {step === "email" && "We'll email you a 6-digit code to confirm it's you."}
            {step === "code" && (
              <>
                Enter the code we sent to <strong>{email}</strong>.
              </>
            )}
            {step === "password" && "Code confirmed. Choose a new password."}
          </p>
        </div>

        <ol className="reset-steps" aria-label="Progress">
          {steps.map((s, i) => (
            <li
              key={s.key}
              className={`reset-step ${i === currentIndex ? "is-current" : ""} ${i < currentIndex ? "is-done" : ""}`}
              aria-current={i === currentIndex ? "step" : undefined}
            >
              <span className="reset-step-dot">{i < currentIndex ? "✓" : i + 1}</span>
              <span className="reset-step-label">{s.label}</span>
            </li>
          ))}
        </ol>

        {step === "email" && (
          <form onSubmit={handleEmailSubmit} className="form">
            <div className="form-group">
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button type="submit" className="btn-primary reset-submit" disabled={loading}>
              {loading ? "Sending code..." : "Send code"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleCodeSubmit} className="form">
            <div className="form-group">
              <label htmlFor="reset-code">6-digit code</label>
              <input
                id="reset-code"
                className="reset-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                // Strip anything non-numeric so a pasted "123 456" still works.
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                maxLength={CODE_LENGTH}
                required
                autoFocus
              />
              <p className={`reset-timer ${codeExpired ? "is-expired" : ""}`}>
                {codeExpired
                  ? "This code has expired — send a new one."
                  : `Expires in ${formatCountdown(secondsLeft)}`}
              </p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button
              type="submit"
              className="btn-primary reset-submit"
              disabled={loading || codeExpired || code.length < CODE_LENGTH}
            >
              {loading ? "Verifying..." : "Verify code"}
            </button>

            <button
              type="button"
              className="btn-outline reset-submit"
              onClick={() => sendCode(email, true)}
              disabled={loading || resendInSeconds > 0}
            >
              {resendInSeconds > 0 ? `Resend code in ${resendInSeconds}s` : "Resend code"}
            </button>

            <button type="button" className="reset-link-btn" onClick={startOver}>
              Use a different email
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handlePasswordSubmit} className="form">
            <PasswordField
              id="reset-password"
              label="New password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              autoFocus
            />

            <PasswordField
              id="reset-confirm"
              label="Confirm new password"
              placeholder="Repeat your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />

            {error && <div className="alert alert-error">{error}</div>}

            <button type="submit" className="btn-primary reset-submit" disabled={loading}>
              {loading ? "Updating..." : "Reset password & sign in"}
            </button>

            <button type="button" className="reset-link-btn" onClick={startOver}>
              Start over
            </button>
          </form>
        )}

        <div className="reset-footer">
          <Link to="/profile">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
