import { useState } from "react";
import { useAuth } from "./useAuth";
import { API_BASE_URL } from "../config";

export function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      await login(email, password);
    } catch {
      setError("Invalid email or password");
    }
  }

  function handleSocialLogin(provider: "Google") {
    const returnUrl = encodeURIComponent(window.location.origin + "/social-login");
    window.location.href = `${API_BASE_URL}/api/auth/external-login?provider=${provider}&returnUrl=${returnUrl}`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 300,
        margin: "40px auto",
      }}
    >
      <h2>Login</h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: 8 }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 8 }}
      />

      {error && <div style={{ color: "red" }}>{error}</div>}

      <button type="submit" style={{ padding: 10 }}>
        Login
      </button>

      {/* --- SOCIAL LOGIN BUTTONS --- */}
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          onClick={() => handleSocialLogin("Google")}
          style={{ padding: 10, background: "#db4437", color: "white", border: "none" }}
        >
          Continue with Google
        </button>

      </div>
    </form>
  );
}
