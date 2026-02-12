import { useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { useAuth } from "./useAuth";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";

export function ProfileAuthPage() {
  const { login, register } = useAuth();

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: ""
  });

  const [registerForm, setRegisterForm] = useState({
    email: "",
    password: "",
    confirmPassword: ""
  });

  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  function handleLoginChange(e: ChangeEvent<HTMLInputElement>) {
    setLoginForm({ ...loginForm, [e.target.name]: e.target.value });
  }

  function handleRegisterChange(e: ChangeEvent<HTMLInputElement>) {
    setRegisterForm({ ...registerForm, [e.target.name]: e.target.value });
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setLoginLoading(true);

    try {
      await login(loginForm.email, loginForm.password);
      toast.success("Successfully logged in");
    } catch {
      // Error toast is handled in auth provider
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();

    if (registerForm.password !== registerForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setRegisterLoading(true);

    try {
      await register(registerForm.email, registerForm.password);
      toast.success("Successfully registered");
    } catch {
      // Error toast is handled in auth provider
    } finally {
      setRegisterLoading(false);
    }
  }

  function handleSocialLogin(provider: "Google") {
    const returnUrl = encodeURIComponent(window.location.origin + "/social-login");
    window.location.href = `${API_BASE_URL}/api/auth/external-login?provider=${provider}&returnUrl=${returnUrl}`;
  }

  return (
    <div className="container profile-auth-container">
      <div className="profile-auth-header card">
        <h1 className="card-title">Welcome to VimeoCopy</h1>
        <p className="profile-auth-subtitle">Use your email/password or continue with Google.</p>
      </div>

      <div className="profile-auth-grid">
        <div className="card profile-auth-card">
          <div className="card-header">
            <h2 className="card-title">Login</h2>
            <p className="profile-auth-lead">Welcome back! Sign in to access your dashboard.</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="form profile-auth-form">
            <div className="form-group profile-form-group">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={loginForm.email}
                onChange={handleLoginChange}
                required
              />
            </div>

            <div className="form-group profile-form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={loginForm.password}
                onChange={handleLoginChange}
                required
              />
            </div>

            <button type="submit" className="btn-primary profile-submit-btn" disabled={loginLoading} style={{ width: "100%" }}>
              {loginLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <div className="card profile-auth-card">
          <div className="card-header">
            <h2 className="card-title">Register</h2>
            <p className="profile-auth-lead">Create your account and start publishing content.</p>
          </div>

          <form onSubmit={handleRegisterSubmit} className="form profile-auth-form">
            <div className="form-group profile-form-group">
              <label htmlFor="register-email">Email</label>
              <input
                id="register-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={registerForm.email}
                onChange={handleRegisterChange}
                required
              />
            </div>

            <div className="form-group profile-form-group">
              <label htmlFor="register-password">Password</label>
              <input
                id="register-password"
                name="password"
                type="password"
                placeholder="Minimum 6 characters"
                value={registerForm.password}
                onChange={handleRegisterChange}
                required
                minLength={6}
              />
            </div>

            <div className="form-group profile-form-group">
              <label htmlFor="register-confirm-password">Confirm Password</label>
              <input
                id="register-confirm-password"
                name="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={registerForm.confirmPassword}
                onChange={handleRegisterChange}
                required
                minLength={6}
              />
            </div>

            <button type="submit" className="btn-primary profile-submit-btn" disabled={registerLoading} style={{ width: "100%" }}>
              {registerLoading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        </div>
      </div>

      <div className="profile-auth-divider" aria-hidden="true"></div>

      <div className="profile-social-wrap">
        <button
          type="button"
          onClick={() => handleSocialLogin("Google")}
          className="btn-outline profile-google-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
