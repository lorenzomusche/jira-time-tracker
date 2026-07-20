import { useEffect } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";

export function useAuth() {
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
  return {
    user: me.data ?? null,
    isLoading: me.isLoading,
    isAuthenticated: !!me.data,
  };
}

/** Redirects to /login when the session is missing. */
export function useRequireAuth() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, navigate]);
  return auth;
}
