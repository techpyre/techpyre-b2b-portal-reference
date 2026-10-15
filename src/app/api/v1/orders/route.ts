import { processOrder } from "@/lib/orders";
import { apiError, json } from "@/lib/http";

export async function POST(request: Request): Promise<Response> {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return apiError(400, "missing_idempotency_key", "Header «Idempotency-Key» obbligatorio (8–128 caratteri).");
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Corpo della richiesta non è JSON valido.");
  }
  const result = processOrder(payload, idempotencyKey);
  return json(result.body, result.httpStatus, { "Idempotency-Key": idempotencyKey });
}
