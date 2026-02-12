import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";
import { useAuth } from "../Auth/useAuth";
import "../App.css";

export function BuyPage() {
  const { authFetch, accessToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleBuy() {
    if (!accessToken) {
      navigate("/profile");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await authFetch(`${API_BASE_URL}/api/payments/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1 }),
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

    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: "500px", margin: "0 auto" }}>
      <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
        <div className="card-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <h1 style={{ marginBottom: "var(--space-2)" }}>Unlock Premium Features</h1>
          <p className="text-muted">Take your video content to the next level with our professional plan</p>
        </div>

        <div className="card-body" style={{ marginTop: "var(--space-8)" }}>
          <div style={{
            backgroundColor: "rgba(34, 197, 94, 0.08)",
            padding: "var(--space-6)",
            borderRadius: "var(--radius-lg)",
            marginBottom: "var(--space-8)",
            border: "1px solid rgba(34, 197, 94, 0.2)"
          }}>
            <p style={{ fontSize: "var(--font-size-3xl)", fontWeight: 700, color: "var(--primary)", marginBottom: "var(--space-2)", textShadow: "0 0 15px rgba(34, 197, 94, 0.4)" }}>
              $9.99
            </p>
            <p className="text-muted" style={{ marginBottom: 0 }}>per month • Cancel anytime</p>
          </div>

          <ul style={{ textAlign: "left", marginBottom: "var(--space-8)", listStyle: "none", color: "var(--gray-500)" }}>
            <li style={{ padding: "var(--space-3)", borderBottom: "1px solid var(--border-color)" }}>✓ Unlimited video uploads</li>
            <li style={{ padding: "var(--space-3)", borderBottom: "1px solid var(--border-color)" }}>✓ Advanced viewer analytics</li>
            <li style={{ padding: "var(--space-3)", borderBottom: "1px solid var(--border-color)" }}>✓ Custom video players</li>
            <li style={{ padding: "var(--space-3)", borderBottom: "1px solid var(--border-color)" }}>✓ Priority email support</li>
            <li style={{ padding: "var(--space-3)" }}>✓ 4K streaming capability</li>
          </ul>

          {error && <div className="alert alert-error" style={{ marginBottom: "var(--space-6)" }}>{error}</div>}

          <button
            onClick={handleBuy}
            disabled={loading}
            className="btn-primary"
            style={{ width: "100%", fontSize: "var(--font-size-lg)", padding: "var(--space-4)" }}
          >
            {loading ? "Processing Payment..." : "Upgrade Now"}
          </button>

          <p className="text-muted" style={{ marginTop: "var(--space-4)", fontSize: "var(--font-size-sm)" }}>
            💳 Secure payment processed by Stripe. Your data is encrypted and secure.
          </p>
        </div>
      </div>
    </div>
  );
}
