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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 25%, var(--bg-surface) 50%, var(--primary) 75%, var(--secondary) 100%)", backgroundSize: "400% 400%", animation: "gradientShift 12s ease infinite" }}>
      <div style={{ textAlign: "center", background: "var(--bg-card)", padding: "var(--space-12)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-xl), 0 0 30px rgba(var(--primary-rgb), 0.15)", border: "1px solid rgba(var(--primary-rgb), 0.2)" }}>
        <div className="loading" style={{ margin: "0 auto var(--space-6)", borderTopColor: "var(--primary)" }}></div>
        <p style={{ color: "var(--primary)", fontWeight: 600, fontSize: "var(--font-size-lg)", textShadow: "0 0 10px rgba(var(--primary-rgb), 0.3)" }}>Signing you in...</p>
        <p style={{ color: "var(--gray-400)", fontSize: "var(--font-size-sm)", marginTop: "var(--space-4)" }}>Redirecting to your dashboard</p>
      </div>
    </div>
  );
}
