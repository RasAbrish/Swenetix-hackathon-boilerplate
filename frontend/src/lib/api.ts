export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
export const TOKEN_KEY = "taskboard_token";

export type ApiError = Error & { status: number; data?: any };

const makeError = (message: string, status: number, data?: unknown): ApiError =>
  Object.assign(new Error(message), { status, data }) as ApiError;

const readToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = readToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw makeError("Cannot reach the server", 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw makeError(data.message || "Request failed", res.status, data);
  }
  return data as T;
}
