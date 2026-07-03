import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { homeForRole } from "../components/ProtectedRoute";
import { Alert, Button, Field, Input } from "../components/ui";

type Step = "phone" | "otp";

export function Login() {
  const navigate = useNavigate();
  const { session, role } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in? Bounce to the right home.
  if (session) {
    navigate(role ? homeForRole(role) : "/onboarding", { replace: true });
  }

  function normalizePhone(raw: string): string {
    const trimmed = raw.trim().replace(/[\s()-]/g, "");
    return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizePhone(phone),
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("otp");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizePhone(phone),
      token: code.trim(),
      type: "sms",
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // AuthContext will pick up the session; route once we know the profile.
    if (data.session) navigate("/onboarding", { replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-brand-50 to-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
            </svg>
          </span>
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            AgriTech
          </span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            {step === "phone" ? "Sign in" : "Enter your code"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {step === "phone"
              ? "We'll text you a one-time code to verify your phone."
              : `Code sent to ${phone}.`}
          </p>

          {error && (
            <div className="mt-4">
              <Alert kind="error">{error}</Alert>
            </div>
          )}

          {step === "phone" ? (
            <form onSubmit={sendCode} className="mt-6 space-y-4">
              <Field label="Phone number" hint="Include country code, e.g. +233…">
                <Input
                  type="tel"
                  autoFocus
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+233 20 000 0000"
                />
              </Field>
              <Button type="submit" loading={busy} className="w-full">
                Send code
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="mt-6 space-y-4">
              <Field label="One-time code">
                <Input
                  inputMode="numeric"
                  autoFocus
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                />
              </Field>
              <Button type="submit" loading={busy} className="w-full">
                Verify & continue
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
                className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Use a different number
              </button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Connecting Ghana's farmers, buyers &amp; drivers.
        </p>
      </div>
    </div>
  );
}
