import { verifySignature } from "@/lib/stripe";
import { apiError, json } from "@/lib/http";

/**
 * Endpoint webhook Stripe: verifica la firma sul body grezzo PRIMA del parsing.
 * La sandbox non ha persistenza condivisa tra invocazioni serverless, per cui la
 * deduplica su `event.id` è dimostrata nel consumer client e documentata nello schema Prisma.
 */
export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return apiError(400, "missing_signature", "Header «Stripe-Signature» assente.");
  const raw = await request.text();
  if (raw.length > 256_000) return apiError(413, "payload_too_large", "Payload oltre 256 KB.");

  const check = await verifySignature(raw, signature);
  if (!check.valid) return apiError(400, "signature_invalid", check.reason);

  let event: { id?: unknown; type?: unknown };
  try {
    event = JSON.parse(raw) as { id?: unknown; type?: unknown };
  } catch {
    return apiError(400, "invalid_json", "Payload non è JSON valido.");
  }
  if (typeof event.id !== "string" || !event.id.startsWith("evt_") || typeof event.type !== "string") {
    return apiError(400, "invalid_event", "Struttura evento Stripe non riconosciuta.");
  }

  return json({ received: true, signatureVerified: true, eventId: event.id, type: event.type, signedAt: check.timestamp });
}
