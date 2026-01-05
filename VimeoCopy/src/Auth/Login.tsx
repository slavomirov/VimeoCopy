import { useState } from "react";
import { useAuth } from "./useAuth";

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
    </form>
  );
}
