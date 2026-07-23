import type { ApiErrorPayload } from "./types";

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as T | ApiErrorPayload;
  if (!response.ok) {
    const error = (payload as ApiErrorPayload).error;
    throw new ApiClientError(error?.message ?? "The request failed.", error?.code ?? "REQUEST_FAILED", response.status);
  }
  return payload as T;
}
