"use client";
import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, authStorage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function CallbackInner() {
  const router      = useRouter();
  const params      = useSearchParams();
  const { setUserFromToken } = useAuth();

  useEffect(() => {
    const code  = params.get("code");
    const token = params.get("token"); // Legacy fallback (degraded mode)

    if (code) {
      // RxHarden T1: Exchange auth code for token via POST (no JWT in URL)
      api.post("/auth/google/exchange", { code })
        .then(({ data }) => {
          authStorage.setToken(data.access_token);
          setUserFromToken({
            token: data.access_token,
            display_name: data.display_name,
            email: data.email,
            user_id: data.user_id,
          });
          router.replace("/");
        })
        .catch(() => {
          router.replace("/?auth_error=google_failed");
        });
    } else if (token) {
      // Legacy fallback: JWT was passed in URL (Redis was down)
      const displayName = params.get("display_name") || "";
      const email       = params.get("email")        || "";
      const userId      = params.get("user_id")      || "";
      authStorage.setToken(token);
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
        <span>Completing Google sign-in...</span>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="auth-shell">
        <div className="auth-loading"><span className="loading-spinner" /></div>
      </div>
    }>
      <CallbackInner />
    </Suspense>
  );
}