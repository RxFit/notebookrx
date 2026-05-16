"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authStorage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallbackPage() {
  const router      = useRouter();
  const params      = useSearchParams();
  const { setUserFromToken } = useAuth();

  useEffect(() => {
    const token        = params.get("token");
    const displayName  = params.get("display_name") || "";
    const email        = params.get("email")        || "";
    const userId       = params.get("user_id")      || "";

    if (token) {
      authStorage.setToken(token);
      // Hydrate auth context directly so the user does not need to refresh
      setUserFromToken({ token, display_name: displayName, email, user_id: userId });
      router.replace("/");
    } else {
      router.replace("/?auth_error=google_failed");
    }
  }, [params, router, setUserFromToken]);

  return (
    <div className="auth-shell">
      <div className="auth-loading">
        <span className="loading-spinner" />
        <span>Completing sign-in...</span>
      </div>
    </div>
  );
}