import { useState } from "react";
import { API_BASE_URL } from "../config";
import { useAuth } from "../Auth/useAuth";

export function BuyPage() {
  const { authFetch } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setError(null);

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

      // 🔥 Redirect към Stripe / Paddle / каквото е
      window.location.href = data.redirectUrl;

    } catch (err) {
      setError("Network error");
    }
  }

  return (
    <div
      style={{
        padding: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 30,
      }}
    >
      <h1>Buy Test Page</h1>

      <button
        onClick={handleBuy}
        style={{
          padding: "16px 40px",
          fontSize: "20px",
          fontWeight: 600,
          borderRadius: "12px",
          border: "none",
          cursor: "pointer",
          background: "linear-gradient(135deg, #6a5af9, #8f7bff)",
          color: "white",
          boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 12px 28px rgba(0,0,0,0.25)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 8px 20px rgba(0,0,0,0.15)";
        }}
      >
        Buy
      </button>

      {error && (
        <div style={{ color: "red", marginTop: 20 }}>
          {error}
        </div>
      )}
    </div>
  );
}
