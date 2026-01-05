import { createContext } from "react";

export interface AuthContextValue {
  accessToken: string | null;
  roles: string[];
  claims: Record<string, unknown>;
  email: string | null; // ако го добави
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: typeof fetch;
}


export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
