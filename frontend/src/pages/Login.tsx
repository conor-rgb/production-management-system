import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const apiUrl = import.meta.env.VITE_API_URL ?? "/api";

type LoginResponse = {
  success: boolean;
  data?: {
    user: {
      id: string;
      email: string;
      fullName: string;
      role: string;
    };
    tokens: {
      accessToken: string;
      refreshToken: string;
    };
  };
  error?: {
    message: string;
  };
};

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = (await response.json()) as LoginResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? "Login failed");
      }

      localStorage.setItem("pms_access_token", payload.data.tokens.accessToken);
      localStorage.setItem("pms_refresh_token", payload.data.tokens.refreshToken);
      localStorage.setItem("pms_user", JSON.stringify(payload.data.user));

      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto flex max-w-md flex-col gap-6 rounded-3xl border border-white/70 bg-white/90 p-8 shadow-[0_30px_60px_rgba(12,18,33,0.12)]">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Unlimited Bond</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Sign in</h1>
          <p className="mt-2 text-sm text-dusk/70">Access the production hub.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
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

          <label className="block text-sm font-medium text-ink">
            Password
            <input
              className="mt-2 w-full rounded-2xl border border-dusk/10 bg-white px-4 py-3 text-sm focus:border-accentDeep focus:outline-none"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-dusk"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs text-dusk/70">
          <Link className="hover:text-ink" to="/reset-password">
            Forgot password?
          </Link>
          <Link className="hover:text-ink" to="/">
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
