"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !password) {
      triggerError("Please enter both User ID and Password.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        triggerError(data.error || "Invalid User ID or Password");
        setLoading(false);
        return;
      }

      // Success - navigate to dashboard
      router.push("/");
      router.refresh();
    } catch {
      triggerError("Unable to connect to server. Please try again.");
      setLoading(false);
    }
  };

  const triggerError = (msg: string) => {
    setErrorMessage(msg);
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  return (
    <div style={{
      minHeight: "100vh",
      width: "100vw",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(ellipse at 80% 20%, rgba(15, 118, 110, 0.22) 0%, transparent 50%), radial-gradient(ellipse at 20% 80%, rgba(14, 165, 233, 0.12) 0%, transparent 50%), #090e17",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: "#e2e8f0",
      position: "relative",
      overflow: "hidden",
      padding: "20px"
    }}>
      {/* Decorative ambient background rings */}
      <div style={{
        position: "absolute",
        width: "550px",
        height: "550px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(15, 118, 110, 0.18) 0%, rgba(15, 118, 110, 0) 70%)",
        top: "-120px",
        right: "-120px",
        filter: "blur(60px)",
        pointerEvents: "none"
      }} />
      <div style={{
        position: "absolute",
        width: "500px",
        height: "500px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0) 70%)",
        bottom: "-100px",
        left: "-100px",
        filter: "blur(60px)",
        pointerEvents: "none"
      }} />

      {/* Main Login Card */}
      <div style={{
        width: "100%",
        maxWidth: "420px",
        background: "rgba(17, 24, 39, 0.75)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRadius: "20px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        padding: "36px 32px",
        position: "relative",
        zIndex: 10,
        transition: "transform 0.2s ease",
        animation: shake ? "shakeAnim 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both" : "none"
      }}>
        {/* Logo / Badge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "28px" }}>
          <div style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
            boxShadow: "0 8px 24px rgba(15, 118, 110, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "16px"
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h1 style={{
            fontSize: "22px",
            fontWeight: 700,
            margin: "0 0 6px 0",
            color: "#ffffff",
            letterSpacing: "-0.4px"
          }}>
            Zeon Outreach Hub
          </h1>
          <p style={{
            margin: 0,
            fontSize: "13.5px",
            color: "#94a3b8",
            textAlign: "center"
          }}>
            Sign in to access leads and email campaigns
          </p>
        </div>

        {/* Error Alert Box */}
        {errorMessage && (
          <div style={{
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            color: "#fca5a5",
            borderRadius: "10px",
            padding: "10px 14px",
            fontSize: "13px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* User ID Field */}
          <div>
            <label style={{
              display: "block",
              fontSize: "12.5px",
              fontWeight: 600,
              color: "#cbd5e1",
              marginBottom: "7px",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              User ID
            </label>
            <div style={{ position: "relative" }}>
              <div style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#64748b",
                pointerEvents: "none",
                display: "flex"
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter your User ID"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 42px",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "10px",
                  fontSize: "14px",
                  color: "#ffffff",
                  outline: "none",
                  transition: "all 0.2s ease"
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#0f766e";
                  e.target.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.25)";
                  e.target.style.background = "rgba(15, 23, 42, 0.85)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                  e.target.style.boxShadow = "none";
                  e.target.style.background = "rgba(15, 23, 42, 0.6)";
                }}
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label style={{
              display: "block",
              fontSize: "12.5px",
              fontWeight: 600,
              color: "#cbd5e1",
              marginBottom: "7px",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <div style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#64748b",
                pointerEvents: "none",
                display: "flex"
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={{
                  width: "100%",
                  padding: "12px 42px 12px 42px",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "10px",
                  fontSize: "14px",
                  color: "#ffffff",
                  outline: "none",
                  transition: "all 0.2s ease"
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#0f766e";
                  e.target.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.25)";
                  e.target.style.background = "rgba(15, 23, 42, 0.85)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                  e.target.style.boxShadow = "none";
                  e.target.style.background = "rgba(15, 23, 42, 0.6)";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px"
                }}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              fontSize: "13px",
              color: "#94a3b8",
              userSelect: "none"
            }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  width: "16px",
                  height: "16px",
                  accentColor: "#0f766e",
                  cursor: "pointer"
                }}
              />
              Remember me
            </label>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Secure Session
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "10px",
              background: loading ? "#0f766e" : "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "10px",
              fontSize: "14.5px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 16px rgba(15, 118, 110, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
              opacity: loading ? 0.75 : 1
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(15, 118, 110, 0.55)";
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(15, 118, 110, 0.4)";
              }
            }}
          >
            {loading ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Security Footer Notice */}
        <div style={{
          marginTop: "28px",
          paddingTop: "20px",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          textAlign: "center",
          fontSize: "12px",
          color: "#64748b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px"
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>End-to-End Encrypted Access</span>
        </div>
      </div>

      <style>{`
        @keyframes shakeAnim {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
