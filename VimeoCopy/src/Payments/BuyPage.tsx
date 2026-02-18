import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";
import { useAuth } from "../Auth/useAuth";
import "../App.css";

type PlanName = "Silver" | "Gold" | "Platinum";

interface Plan {
  name: PlanName;
  storage: string;
  bandwidth: string;
  priceEur: number;
  icon: string;
  tagline: string;
  features: string[];
  popular?: boolean;
}

const plans: Plan[] = [
  {
    name: "Silver",
    storage: "200GB",
    bandwidth: "800GB/mo",
    priceEur: 15,
    icon: "🥈",
    tagline: "Perfect for creators just getting started",
    features: [
      "200GB cloud storage",
      "800GB bandwidth per month",
      "Full quality video hosting",
      "Basic analytics",
    ],
  },
  {
    name: "Gold",
    storage: "1TB",
    bandwidth: "2TB/mo",
    priceEur: 35,
    icon: "🥇",
    tagline: "For growing channels that need more power",
    popular: true,
    features: [
      "1TB cloud storage",
      "2TB bandwidth per month",
      "Full quality video hosting",
      "Advanced analytics",
      "Priority support",
    ],
  },
  {
    name: "Platinum",
    storage: "2TB",
    bandwidth: "4TB/mo",
    priceEur: 60,
    icon: "💎",
    tagline: "Unlimited ambition, enterprise-grade delivery",
    features: [
      "2TB cloud storage",
      "4TB bandwidth per month",
      "Full quality video hosting",
      "Premium analytics suite",
      "Dedicated support",
      "Early access to features",
    ],
  },
];

/* ── inline keyframes injected once ─────────────── */
const styleTag = document.createElement("style");
styleTag.textContent = `
@keyframes buypage-fadein {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes buypage-glow-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(34,197,94,0.15), 0 0 60px rgba(34,197,94,0.06); }
  50%      { box-shadow: 0 0 30px rgba(34,197,94,0.30), 0 0 80px rgba(34,197,94,0.12); }
}
@keyframes buypage-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes buypage-badge-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.06); }
}
`;
if (!document.querySelector("[data-buypage-styles]")) {
  styleTag.setAttribute("data-buypage-styles", "");
  document.head.appendChild(styleTag);
}

export function BuyPage() {
  const { authFetch, accessToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<PlanName | null>(null);

  async function handleBuy(planName: PlanName) {
    if (!accessToken) {
      navigate("/profile");
      return;
    }

    setError(null);
    setLoadingPlan(planName);

    try {
      const res = await authFetch(`${API_BASE_URL}/api/payments/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: planName }),
      });

      if (!res.ok) {
        setError("Server returned an error");
        return;
      }

      const data = await res.json();

      if (!data.redirectUrl) {
        setError("No redirect URL returned from backend");
        return;
      }

      window.location.href = data.redirectUrl;
    } catch {
      setError("Network error");
    } finally {
      setLoadingPlan(null);
    }
  }

  /* ── helpers ──────────────────────────────── */
  const cardBorder = (plan: Plan) =>
    plan.popular
      ? "1px solid rgba(34,197,94,0.55)"
      : "1px solid rgba(34,197,94,0.18)";

  const cardShadow = (plan: Plan) =>
    plan.popular
      ? "0 0 30px rgba(34,197,94,0.22), 0 8px 32px rgba(0,0,0,0.5)"
      : "0 4px 20px rgba(0,0,0,0.4)";

  return (
    <div
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "var(--space-6) var(--space-4)",
        animation: "buypage-fadein .6s ease both",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* ── Hero header ─────────────────────── */}
      <div style={{ textAlign: "center", marginBottom: "var(--space-6)" }}>
        <p
          style={{
            fontSize: "var(--font-size-xs)",
            textTransform: "uppercase",
            letterSpacing: "3px",
            color: "var(--primary)",
            marginBottom: "var(--space-2)",
            fontWeight: 600,
          }}
        >
          Simple, transparent pricing
        </p>
        <h1
          style={{
            fontSize: "clamp(1.4rem, 3vw, 2.2rem)",
            fontWeight: 800,
            lineHeight: 1.2,
            marginBottom: "var(--space-2)",
            background: "linear-gradient(135deg, var(--gray-900), var(--primary))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Power your videos. Pick the plan that fits.
        </h1>
        <p
          style={{
            color: "var(--gray-400)",
            fontSize: "var(--font-size-base)",
            maxWidth: 540,
            margin: "0 auto",
            lineHeight: 1.5,
          }}
        >
          Every plan delivers <strong style={{ color: "var(--secondary)" }}>zero quality loss</strong> for
          your hosted content — your audience sees exactly what you uploaded.
        </p>
      </div>

      {/* ── Plan cards grid ─────────────────── */}
      <div
        className="buypage-grid"
        style={{
          marginBottom: "var(--space-4)",
        }}
      >
        {plans.map((plan, i) => {
          const isLoading = loadingPlan === plan.name;
          const delay = `${i * 0.12 + 0.2}s`;

          return (
            <div
              key={plan.name}
              style={{
                position: "relative",
                background: plan.popular
                  ? "linear-gradient(170deg, rgba(34,197,94,0.12) 0%, var(--bg-card) 40%, var(--bg-surface) 100%)"
                  : "linear-gradient(170deg, var(--bg-card) 0%, var(--bg-surface) 100%)",
                border: cardBorder(plan),
                borderRadius: "var(--radius-xl)",
                padding: "var(--space-4) var(--space-5)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
                boxShadow: cardShadow(plan),
                transition: "transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease",
                animation: `buypage-fadein .5s ease ${delay} both${plan.popular ? ", buypage-glow-pulse 4s ease-in-out infinite" : ""}`,
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = plan.popular ? "translateY(-8px) scale(1.03)" : "translateY(-6px)";
                e.currentTarget.style.boxShadow =
                  "0 0 40px rgba(34,197,94,0.28), 0 14px 40px rgba(0,0,0,0.55)";
                e.currentTarget.style.borderColor = "rgba(34,197,94,0.6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = cardShadow(plan);
                e.currentTarget.style.borderColor = plan.popular
                  ? "rgba(34,197,94,0.55)"
                  : "rgba(34,197,94,0.18)";
              }}
            >
              {/* Popular badge */}
              {plan.popular && (
                <span
                  style={{
                    position: "absolute",
                    top: -14,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                    color: "#000",
                    fontWeight: 700,
                    fontSize: "var(--font-size-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "1.5px",
                    padding: "4px 18px",
                    borderRadius: 999,
                    boxShadow: "0 0 14px rgba(34,197,94,0.45)",
                    animation: "buypage-badge-pulse 3s ease-in-out infinite",
                  }}
                >
                  Most Popular
                </span>
              )}

              {/* Icon + name */}
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: "1.6rem" }}>{plan.icon}</span>
                <h2
                  style={{
                    margin: "var(--space-1) 0 0",
                    fontSize: "var(--font-size-xl)",
                    fontWeight: 700,
                    color: "var(--gray-900)",
                  }}
                >
                  {plan.name}
                </h2>
                <p
                  style={{
                    color: "var(--gray-400)",
                    fontSize: "var(--font-size-sm)",
                    marginTop: "var(--space-1)",
                  }}
                >
                  {plan.tagline}
                </p>
              </div>

              {/* Price */}
              <div style={{ textAlign: "center", margin: "0" }}>
                <span
                  style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: "var(--primary)",
                    textShadow: "0 0 18px rgba(34,197,94,0.35)",
                    lineHeight: 1,
                  }}
                >
                  €{plan.priceEur}
                </span>
                <span style={{ color: "var(--gray-400)", fontSize: "var(--font-size-base)", marginLeft: 4 }}>
                  /month
                </span>
              </div>

              {/* Capacity badges */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                }}
              >
                {[
                  { label: plan.storage, sub: "Storage" },
                  { label: plan.bandwidth, sub: "Bandwidth" },
                ].map((b) => (
                  <div
                    key={b.sub}
                    style={{
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.18)",
                      borderRadius: "var(--radius-sm)",
                      padding: "var(--space-1) var(--space-3)",
                      textAlign: "center",
                      minWidth: 90,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "var(--gray-800)", fontSize: "var(--font-size-sm)" }}>
                      {b.label}
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "var(--gray-400)" }}>
                      {b.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div
                style={{
                  height: 1,
                  background: "linear-gradient(90deg, transparent, rgba(34,197,94,0.25), transparent)",
                  margin: "0",
                }}
              />

              {/* Feature list */}
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-1)",
                  flex: 1,
                }}
              >
                {plan.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      color: "var(--gray-500)",
                      fontSize: "var(--font-size-xs)",
                    }}
                  >
                    <span style={{ color: "var(--primary)", fontWeight: 700, fontSize: "1rem" }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                onClick={() => handleBuy(plan.name)}
                disabled={loadingPlan !== null}
                className="btn-primary"
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: 600,
                  marginTop: "var(--space-2)",
                  borderRadius: "var(--radius-md)",
                  background: plan.popular
                    ? "linear-gradient(135deg, var(--primary), var(--secondary))"
                    : undefined,
                  color: plan.popular ? "#000" : undefined,
                  boxShadow: plan.popular ? "0 0 20px rgba(34,197,94,0.35)" : undefined,
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.03)";
                  e.currentTarget.style.boxShadow = "0 0 28px rgba(34,197,94,0.45)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "";
                  e.currentTarget.style.boxShadow = plan.popular
                    ? "0 0 20px rgba(34,197,94,0.35)"
                    : "";
                }}
              >
                {isLoading ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTop: "2px solid #fff",
                        borderRadius: "50%",
                        display: "inline-block",
                        animation: "buypage-shimmer 0.8s linear infinite",
                      }}
                    />
                    Processing…
                  </span>
                ) : (
                  `Get ${plan.name}`
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Error ───────────────────────────── */}
      {error && (
        <div
          className="alert alert-error"
          style={{
            maxWidth: 560,
            margin: "0 auto var(--space-3)",
            textAlign: "center",
            animation: "buypage-fadein .3s ease both",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Trust footer ────────────────────── */}
      <div
        style={{
          textAlign: "center",
          color: "var(--gray-400)",
          fontSize: "var(--font-size-xs)",
          maxWidth: 480,
          margin: "0 auto",
          lineHeight: 1.5,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          🔒 <strong style={{ color: "var(--gray-500)" }}>Enterprise-grade security</strong>
        </span>
        <br />
        Payments encrypted end-to-end via <strong style={{ color: "var(--gray-500)" }}>Stripe</strong>.
        Cancel anytime — no hidden fees.
      </div>
    </div>
  );
}
