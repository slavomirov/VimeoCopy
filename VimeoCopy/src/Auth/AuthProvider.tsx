import React, { useEffect, useState, useCallback } from "react";
import { AuthContext } from "./AuthContext";
import { API_BASE_URL } from "../config";
import { jwtDecode } from "jwt-decode";
import toast from "react-hot-toast";

interface TokenPayload {
  sub: string;
  email: string;
  role?: string | string[];
  [key: string]: unknown;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [claims, setClaims] = useState<Record<string, unknown>>({});
  const [email, setEmail] = useState<string | null>(null);

  // Decode JWT and extract claims
  const processToken = useCallback((token: string) => {
    const decoded = jwtDecode<TokenPayload>(token);

    const extractedRoles = Array.isArray(decoded.role)
      ? decoded.role
      : decoded.role
        ? [decoded.role]
        : [];

    setRoles(extractedRoles);
    setClaims(decoded);
    setEmail(decoded.email || null);
  }, []);

  // Used for social login redirect
  const loginWithToken = useCallback(
    (token: string) => {
      setAccessToken(token);
      processToken(token);
    },
    [processToken]
  );

  // Refresh token flow
  const refreshToken = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      setAccessToken(null);
      setRoles([]);
      setClaims({});
      setEmail(null);
      return null;
    }

    const data = await res.json();
    setAccessToken(data.accessToken);
    processToken(data.accessToken);
    return data.accessToken;
  }, [processToken]);

  // Normal login
  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      toast.error("Invalid email or password");
      throw new Error("Invalid credentials");
    }

    const data = await res.json();
    setAccessToken(data.accessToken);
    processToken(data.accessToken);
  }

  async function register(email: string, password: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.message || "Registration failed";
      toast.error(msg);
      throw new Error(msg);
    }

    const data = await res.json();

    // Ако backend връща accessToken след регистрация
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      processToken(data.accessToken);
    }

    return data;
  }


  // Logout
  async function logout() {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    setAccessToken(null);
    setRoles([]);
    setClaims({});
    setEmail(null);
  }

  // Global fetch wrapper with auto-refresh + error notifications
  const authFetch: typeof fetch = useCallback(
    async (input, init = {}) => {
      const headers = new Headers(init.headers || {});

      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }

      let res = await fetch(input, {
        ...init,
        headers,
        credentials: "include",
      });

      // Auto refresh on 401
      if (res.status === 401) {
        const newToken = await refreshToken();

        if (!newToken) {
          toast.error("Session expired. Please log in again.");
          return res;
        }

        const headers2 = new Headers(init.headers || {});
        headers2.set("Authorization", `Bearer ${newToken}`);

        res = await fetch(input, {
          ...init,
          headers: headers2,
          credentials: "include",
        });
      }

      // Global error popup
      if (!res.ok) {
        try {
          const data = await res.json();
          const msg = data.message || data.error || "Unexpected server error";
          toast.error(msg);
        } catch {
          toast.error("Unexpected server error");
        }
      }

      return res;
    },
    [accessToken, refreshToken]
  );

  // Auto refresh every 10 minutes
  useEffect(() => {
    const id = setInterval(() => {
      if (accessToken) refreshToken();
    }, 10 * 60 * 1000);

    return () => clearInterval(id);
  }, [accessToken, refreshToken]);

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        roles,
        claims,
        email,
        login,
        loginWithToken,
        logout,
        authFetch,
        register
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
