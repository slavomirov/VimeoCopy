import { useState } from "react";
import { API_BASE_URL } from "../config";
import { useAuth } from "../Auth/useAuth";
import "../App.css";

/**
 * Contact form — writes to the site owners via POST /api/contact.
 *
 * Deliberately usable without an account: someone who cannot sign in is exactly the person most
 * likely to need to reach us. The endpoint is anonymous and rate limited to 3/minute per client.
 *
 * The recipient is a server-side config value (ContactUs:Recipient) and is never part of the
 * request, so this form cannot be pointed at anyone else.
 */

const MESSAGE_MAX = 4000;
const MESSAGE_MIN = 10;

/**
 * The form itself, so the sidebar modal and the /contact page are one implementation rather than
 * two that drift apart. `onSent` lets the modal close itself after a successful send.
 */
export function ContactForm({ onSent }: { onSent?: () => void } = {}) {
  // The signed-in address lives on the context itself, not inside `claims` (an untyped bag of JWT
  // claims), so it is read from there and used only as the initial value.
  const { email: accountEmail } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(accountEmail ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const tooShort = message.trim().length > 0 && message.trim().length < MESSAGE_MIN;
  const canSend =
    !busy &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    subject.trim().length > 0 &&
    message.trim().length >= MESSAGE_MIN;

  const labelStyle = { display: "block", marginBottom: "var(--space-1)", fontWeight: 500 } as const;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;

    setBusy(true);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        // 429 carries no JSON body of ours, so it needs saying explicitly rather than falling
        // through to a generic failure the sender can do nothing about.
        const text =
          res.status === 429
            ? "That's a few messages in quick succession — please wait a minute and try again."
            : body?.message || body?.title || "We couldn't send that message. Please try again in a moment.";
        setResult({ kind: "err", text });
        return;
      }

      setResult({ kind: "ok", text: "Thanks — your message is on its way. We'll reply by email." });
      setSubject("");
      setMessage("");
      onSent?.();
    } catch {
      setResult({ kind: "err", text: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div>
        <label htmlFor="contact-name" style={labelStyle}>Your name</label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          autoComplete="name"
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label htmlFor="contact-email" style={labelStyle}>Your email</label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          required
          autoComplete="email"
          style={{ width: "100%" }}
        />
        <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)", marginBottom: 0 }}>
          We only use this to reply to you.
        </p>
      </div>

      <div>
        <label htmlFor="contact-subject" style={labelStyle}>Subject</label>
        <input
          id="contact-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={150}
          required
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label htmlFor="contact-message" style={labelStyle}>How can we help?</label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MESSAGE_MAX}
          rows={7}
          required
          placeholder="Describe the problem or question in as much detail as you like."
          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-1)" }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: tooShort ? "var(--danger)" : "var(--gray-400)" }}>
            {tooShort ? `At least ${MESSAGE_MIN} characters, please.` : ""}
          </span>
          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
            {message.length} / {MESSAGE_MAX}
          </span>
        </div>
      </div>

      {result && (
        <div
          role="status"
          style={{
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-sm)",
            backgroundColor:
              result.kind === "ok" ? "rgba(var(--primary-rgb), 0.12)" : "rgba(var(--danger-rgb), 0.12)",
            color: result.kind === "ok" ? "var(--success)" : "var(--danger)",
          }}
        >
          {result.text}
        </div>
      )}

      <button type="submit" className="btn-primary" disabled={!canSend} style={{ alignSelf: "flex-start" }}>
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

/**
 * The standalone page. Kept alongside the sidebar modal on purpose: it is linkable, it survives a
 * reload, and it works for someone who can't sign in — the person most likely to be writing in.
 */
export function ContactPage() {
  return (
    <div className="container" style={{ maxWidth: "680px" }}>
      <div className="card">
        <div className="card-header">
          <h1 style={{ marginBottom: "var(--space-1)" }}>Contact us</h1>
          <p className="text-muted" style={{ marginBottom: 0 }}>
            Questions, problems with your account, copyright concerns — send them here and a human
            will read them.
          </p>
        </div>
        <div className="card-body">
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
