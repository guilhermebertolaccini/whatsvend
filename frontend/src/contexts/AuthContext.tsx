import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  authService,
  getAuthToken,
  setAuthToken,
  type LoginResponse,
} from "@/services/api";

export type UserRole =
  | "admin"
  | "supervisor"
  | "operador"
  | "ativador"
  | "digital";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  segmentId?: number;
  lineId?: number;
  isOnline: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Map API role to frontend role
const mapRole = (apiRole: string): UserRole => {
  switch (apiRole) {
    case "admin":
      return "admin";
    case "supervisor":
      return "supervisor";
    case "operator":
      return "operador";
    case "ativador":
      return "ativador";
    case "digital":
      return "digital";
    default:
      return "operador";
  }
};

// Map API user to frontend user
const mapUser = (apiUser: LoginResponse["user"]): User => ({
  id: String(apiUser.id),
  name: apiUser.name,
  email: apiUser.email,
  role: mapRole(apiUser.role),
  segmentId: apiUser.segment ?? undefined,
  lineId: apiUser.line ?? undefined,
  isOnline: apiUser.status === "Online",
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Check for existing token on mount
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      authService
        .me()
        .then((apiUser) => {
          setState({
            user: mapUser(apiUser),
            isAuthenticated: true,
            isLoading: false,
          });
        })
        .catch(() => {
          setAuthToken(null);
          setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        });
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const response = await authService.login(email, password);
        setState({
          user: mapUser(response.user),
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } catch (error) {
        console.error("Login error:", error);
        setState((prev) => ({ ...prev, isLoading: false }));
        return false;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
