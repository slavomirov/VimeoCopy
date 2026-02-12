import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./Auth/useAuth";
import toast from "react-hot-toast";
import "./App.css";

export default function SocialLoginPage() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("accessToken");
    const error = params.get("error");

    if (error) {
      toast.error(error);
      navigate("/profile");
      return;
    }

    if (token) {
      loginWithToken(token);
      navigate("/");
    } else {
      navigate("/profile");
    }
  }, [loginWithToken, navigate]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "linear-gradient(135deg, #22C55E 0%, #15803D 25%, #0F172A 50%, #22C55E 75%, #4ADE80 100%)", backgroundSize: "400% 400%", animation: "gradientShift 12s ease infinite" }}>
      <div style={{ textAlign: "center", background: "var(--bg-card)", padding: "var(--space-12)", borderRadius: "var(--radius-xl)", boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5), 0 0 30px rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
        <div className="loading" style={{ margin: "0 auto var(--space-6)", borderTopColor: "var(--primary)" }}></div>
        <p style={{ color: "var(--primary)", fontWeight: 600, fontSize: "var(--font-size-lg)", textShadow: "0 0 10px rgba(34, 197, 94, 0.3)" }}>Signing you in...</p>
        <p style={{ color: "var(--gray-400)", fontSize: "var(--font-size-sm)", marginTop: "var(--space-4)" }}>Redirecting to your dashboard</p>
      </div>
    </div>
  );
}
