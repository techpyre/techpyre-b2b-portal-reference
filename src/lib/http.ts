import type { ApiErrorResponse, Permission } from "@/types";

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Powered-By-Architecture": "TechPYRE Reference Architecture #1",
} as const;

export function json<T>(body: T, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...BASE_HEADERS, ...extra } });
}

export function apiError(status: number, error: string, message: string, requiredPermission?: Permission): Response {
  const body: ApiErrorResponse = { status: "error", error, message, ...(requiredPermission ? { requiredPermission } : {}) };
  return json(body, status);
}
