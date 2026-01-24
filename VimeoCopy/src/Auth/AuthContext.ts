import { createContext } from "react";

export interface AuthContextValue {
  accessToken: string | null;
  roles: string[];
  claims: Record<string, unknown>;
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => void; 
  logout: () => Promise<void>;
  authFetch: typeof fetch;
  register: (email: string, password: string) => Promise<void>;
}



export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
