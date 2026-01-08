const apiUrl = import.meta.env.VITE_API_URL ?? "/api";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string };
};

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const payload = await apiFetchRaw<T>(path, init);
  if (payload.data === undefined) {
    throw new Error("Empty response");
  }
  return payload.data;
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("pms_refresh_token");
  if (!refreshToken) {
    throw new Error("Missing refresh token");
  }

  const response = await fetch(`${apiUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });

  const payload = (await response.json()) as ApiEnvelope<{
    user: { id: string; email: string; fullName: string; role: string };
    tokens: { accessToken: string; refreshToken: string };
  }>;

  if (!response.ok || payload.success === false || !payload.data) {
    throw new Error(payload.error?.message ?? "Refresh failed");
  }

  localStorage.setItem("pms_access_token", payload.data.tokens.accessToken);
  localStorage.setItem("pms_refresh_token", payload.data.tokens.refreshToken);
  localStorage.setItem("pms_user", JSON.stringify(payload.data.user));
}

export async function apiFetchRaw<T>(
  path: string,
  init: RequestInit = {},
  options: { retryOnUnauthorized?: boolean } = { retryOnUnauthorized: true }
): Promise<ApiEnvelope<T>> {
  const token = localStorage.getItem("pms_access_token");
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (response.status === 401 && options.retryOnUnauthorized) {
    try {
      await refreshAccessToken();
      return apiFetchRaw(path, init, { retryOnUnauthorized: false });
    } catch (error) {
      localStorage.removeItem("pms_access_token");
      localStorage.removeItem("pms_refresh_token");
      localStorage.removeItem("pms_user");
      throw new Error(
        error instanceof Error ? error.message : "Session expired. Please sign in again."
      );
    }
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.error?.message ?? "Request failed");
  }

  return payload;
}
