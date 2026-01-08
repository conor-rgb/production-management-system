import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const apiUrl = import.meta.env.VITE_API_URL ?? "/api";

type ApiResponse = {
  success: boolean;
  data?: {
    message?: string;
  };
  error?: {
    message: string;
  };
};

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const hasToken = token.length > 0;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const helperText = useMemo(() => {
    if (hasToken) {
      return "Set a new password to regain access.";
    }
    return "Enter your email and we will send you a reset link.";
  }, [hasToken]);

  async function handleRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "Request failed");
      }

      setSuccess(payload.data?.message ?? "Check your email for the reset link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "Reset failed");
      }

      setSuccess(payload.data?.message ?? "Password reset successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto flex max-w-md flex-col gap-6 rounded-3xl border border-white/70 bg-white/90 p-8 shadow-[0_30px_60px_rgba(12,18,33,0.12)]">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Unlimited Bond</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Reset password</h1>
          <p className="mt-2 text-sm text-dusk/70">{helperText}</p>
        </div>

        {hasToken ? (
          <form className="space-y-4" onSubmit={handleReset}>
            <label className="block text-sm font-medium text-ink">
              New password
              <input
                className="mt-2 w-full rounded-2xl border border-dusk/10 bg-white px-4 py-3 text-sm focus:border-accentDeep focus:outline-none"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <label className="block text-sm font-medium text-ink">
              Confirm password
              <input
                className="mt-2 w-full rounded-2xl border border-dusk/10 bg-white px-4 py-3 text-sm focus:border-accentDeep focus:outline-none"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-600">{success}</p>}

            <button
              type="submit"
              className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-dusk"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleRequest}>
            <label className="block text-sm font-medium text-ink">
              Email
              <input
                className="mt-2 w-full rounded-2xl border border-dusk/10 bg-white px-4 py-3 text-sm focus:border-accentDeep focus:outline-none"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@unlimited.bond"
                required
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-600">{success}</p>}

            <button
              type="submit"
              className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-dusk"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <div className="flex items-center justify-between text-xs text-dusk/70">
          <Link className="hover:text-ink" to="/login">
            Back to sign in
          </Link>
          <Link className="hover:text-ink" to="/">
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
