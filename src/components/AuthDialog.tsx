import { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleUserRound, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { api } from "../api";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AuthDialog({ open, onClose }: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) {
      setGoogleAvailable(null);
      void api<{ google: boolean }>("/api/auth/methods")
        .then((methods) => setGoogleAvailable(methods.google))
        .catch(() => setGoogleAvailable(false));
    }
  }, [open]);

  return (
    <dialog ref={dialogRef} className="modal auth-modal" onClose={onClose}>
      <div className="modal-box auth-modal-box">
        <button className="btn btn-ghost btn-circle auth-close" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close authentication"><X size={18} /></button>
        <div className="auth-brand"><span className="brand-mark"><LockKeyhole size={19} /></span><span>Google account access</span></div>
        <h2>Continue with Google</h2>
        <p>Sign in with your Google account. New users are set up automatically—no separate email or password is needed.</p>

        <div className="auth-provider">
          {googleAvailable === null ? (
            <button className="btn btn-outline auth-google-button" type="button" disabled>
              <span className="loading loading-spinner loading-sm" />
              Checking Google sign-in
            </button>
          ) : googleAvailable ? (
            <a className="btn btn-outline auth-google-button" href="/api/auth/oauth/google/start">
              <CircleUserRound size={18} />
              <span>Continue with Google</span>
              <ArrowRight size={17} />
            </a>
          ) : (
            <div role="status" className="alert alert-warning alert-soft auth-provider-status">
              <span>Google sign-in is not configured in this environment.</span>
            </div>
          )}
        </div>

        <div className="auth-trust"><ShieldCheck size={15} /><span>Google confirms your email. OAuth tokens are never stored. Your generations remain private by default.</span></div>
      </div>
      <form method="dialog" className="modal-backdrop"><button>Close</button></form>
    </dialog>
  );
}
