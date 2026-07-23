import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CircleUserRound, Github, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { api } from "../api";
import type { AuthMethods, SessionState } from "../types";

interface AuthDialogProps {
  open: boolean;
  initialMode: "login" | "register";
  resetToken?: string;
  onClose: () => void;
  onResetComplete?: () => void;
  onSuccess: (session: SessionState) => void;
}

type AuthMode = "login" | "register" | "forgot" | "reset";
type AuthResponse = SessionState;

const defaultMethods: AuthMethods = { password: true, google: false, github: false };

export function AuthDialog({ open, initialMode, resetToken, onClose, onResetComplete, onSuccess }: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [methods, setMethods] = useState<AuthMethods>(defaultMethods);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(resetToken ?? "");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(resetToken ? "reset" : initialMode);
    setToken(resetToken ?? "");
    setError("");
    setInfo("");
  }, [initialMode, open, resetToken]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) void api<AuthMethods>("/api/auth/methods").then(setMethods).catch(() => setMethods(defaultMethods));
  }, [open]);

  function finishClose() {
    onClose();
  }

  function chooseMode(next: AuthMode) {
    setMode(next);
    setError("");
    setInfo("");
    setPassword("");
  }

  function moveAuthTab(next: "login" | "register") {
    chooseMode(next);
    window.requestAnimationFrame(() => document.getElementById(`auth-${next}-tab`)?.focus());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setInfo("");
    try {
      if (mode === "forgot") {
        await api<{ accepted: true }>("/api/auth/password-reset/request", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        setInfo("If an account exists for that email, a one-time reset link has been sent.");
        return;
      }

      if (mode === "reset") {
        await api<{ reset: true }>("/api/auth/password-reset/confirm", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        setPassword("");
        setToken("");
        setMode("login");
        setInfo("Password updated. Sign in with your new password.");
        onResetComplete?.();
        return;
      }

      const payload = await api<AuthResponse>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }),
      });
      setPassword("");
      onSuccess({ user: payload.user, entitlements: payload.entitlements });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const heading = mode === "register" ? "Build your creative workspace"
    : mode === "forgot" ? "Recover your account"
      : mode === "reset" ? "Choose a new password"
        : "Welcome back";
  const description = mode === "register" ? "Create an account and receive 20 welcome credits. Email verification protects recovery and developer access."
    : mode === "forgot" ? "We will send a one-time link without revealing whether the address is registered."
      : mode === "reset" ? "Use the one-time token from your email to replace the password on every device."
        : "Sign in to access projects, credits, favorites, and developer keys.";

  return (
    <dialog ref={dialogRef} className="modal auth-modal" onClose={finishClose}>
      <div className="modal-box auth-modal-box">
        <button className="btn btn-ghost btn-circle auth-close" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close authentication"><X size={18} /></button>
        <div className="auth-brand"><span className="brand-mark"><LockKeyhole size={19} /></span><span>Private account access</span></div>
        <h2>{heading}</h2>
        <p>{description}</p>

        {(mode === "login" || mode === "register") && (
          <div role="tablist" className="tabs tabs-box auth-tabs" aria-label="Authentication mode">
            <button id="auth-login-tab" role="tab" aria-controls="auth-form-panel" aria-selected={mode === "login"} tabIndex={mode === "login" ? 0 : -1} className={`tab ${mode === "login" ? "tab-active" : ""}`} type="button" onClick={() => chooseMode("login")} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "End") { event.preventDefault(); moveAuthTab("register"); } }}>Sign in</button>
            <button id="auth-register-tab" role="tab" aria-controls="auth-form-panel" aria-selected={mode === "register"} tabIndex={mode === "register" ? 0 : -1} className={`tab ${mode === "register" ? "tab-active" : ""}`} type="button" onClick={() => chooseMode("register")} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "Home") { event.preventDefault(); moveAuthTab("login"); } }}>Create account</button>
          </div>
        )}

        <form
          id="auth-form-panel"
          className="auth-form"
          role={mode === "login" || mode === "register" ? "tabpanel" : undefined}
          aria-labelledby={mode === "login" || mode === "register" ? `auth-${mode}-tab` : undefined}
          onSubmit={submit}
        >
          {mode === "register" && <label><span>Name</span><input className="input" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" required minLength={2} maxLength={60} /></label>}
          {mode !== "reset" && <label><span>Email</span><input className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>}
          {(mode === "login" || mode === "register" || mode === "reset") && <label><span>{mode === "reset" ? "New password" : "Password"}</span><input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required minLength={8} maxLength={128} /></label>}
          {error && <div role="alert" className="alert alert-error alert-soft auth-error"><span>{error}</span></div>}
          {info && <div role="status" className="alert alert-success alert-soft auth-error"><span>{info}</span></div>}
          <button className="btn auth-submit" type="submit" disabled={submitting}>
            {submitting && <span className="loading loading-spinner loading-sm" />}
            {mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Set new password" : "Sign in"}<ArrowRight size={17} />
          </button>
          {mode === "login" && <button className="btn btn-ghost btn-sm auth-secondary" type="button" onClick={() => chooseMode("forgot")}>Forgot your password?</button>}
          {(mode === "forgot" || mode === "reset") && <button className="btn btn-ghost btn-sm auth-secondary" type="button" onClick={() => chooseMode("login")}><ArrowLeft size={14} />Back to sign in</button>}
        </form>

        {(mode === "login" || mode === "register") && (methods.google || methods.github) && (
          <div className="auth-social">
            <div className="divider">Or continue with</div>
            <div>
              {methods.google && <a className="btn btn-outline" href="/api/auth/oauth/google/start"><CircleUserRound size={17} />Google</a>}
              {methods.github && <a className="btn btn-outline" href="/api/auth/oauth/github/start"><Github size={17} />GitHub</a>}
            </div>
          </div>
        )}

        <div className="auth-trust"><ShieldCheck size={15} /><span>Passwords are salted and hashed. OAuth tokens are never stored. Your generations remain private by default.</span></div>
      </div>
      <form method="dialog" className="modal-backdrop"><button>Close</button></form>
    </dialog>
  );
}
