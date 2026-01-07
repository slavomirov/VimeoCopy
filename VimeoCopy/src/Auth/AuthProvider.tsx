import React, { useEffect, useState, useCallback } from "react";
import { AuthContext } from "./AuthContext";
import { API_BASE_URL } from "../config";
import { jwtDecode } from "jwt-decode";

interface TokenPayload {
  sub: string;
  email: string;
  role?: string | string[];
  [key: string]: unknown; // claims
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [claims, setClaims] = useState<Record<string, unknown>>({});
  const [email, setEmail] = useState<string | null>(null);

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

  const loginWithToken = useCallback((token: string) => {
    setAccessToken(token);
    processToken(token);
  }, [processToken]);

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

  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) throw new Error("Invalid credentials");

    const data = await res.json();
    setAccessToken(data.accessToken);
    processToken(data.accessToken);
  }

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

  const authFetch: typeof fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    let res = await fetch(input, {
      ...init,
      headers,
      credentials: "include",
    });

    if (res.status === 401) {
      const newToken = await refreshToken();

      if (!newToken) return res;

      const headers2 = new Headers(init.headers || {});
      headers2.set("Authorization", `Bearer ${newToken}`);

      res = await fetch(input, {
        ...init,
        headers: headers2,
        credentials: "include",
      });
    }

    return res;
  };

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
