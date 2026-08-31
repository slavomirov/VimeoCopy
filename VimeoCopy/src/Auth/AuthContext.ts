import { createContext } from "react";

/**
 * fetch init plus `silent`, which suppresses authFetch's global error toast for callers that
 * render the failure inline themselves.
 */
export type AuthFetchInit = RequestInit & { silent?: boolean };

export type AuthFetch = (input: RequestInfo | URL, init?: AuthFetchInit) => Promise<Response>;

export interface AuthContextValue {
  accessToken: string | null;
  roles: string[];
  claims: Record<string, unknown>;
  email: string | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => void;
  logout: () => Promise<void>;
  authFetch: AuthFetch;
  register: (email: string, password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
