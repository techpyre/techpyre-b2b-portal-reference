import type { CompanyId, SignedWebhook, WebhookLogEntry } from "@/types";

/**
 * Consumer idempotente degli eventi Stripe: deduplica su `event.id`.
 * In produzione il vincolo è garantito da un indice UNIQUE su `WebhookLog.stripeEventId`
 * e dall'inserimento nella stessa transazione dell'effetto di dominio.
 * Stripe richiede sempre una risposta 2xx anche per i duplicati, altrimenti ritenta.
 */
export function consumeWebhook(
  processedEventIds: ReadonlySet<string>,
  webhook: SignedWebhook,
  context: { orderCode: string; companyId: CompanyId; isReplay: boolean; receivedAt: Date },
): { entry: WebhookLogEntry; processedEventIds: Set<string> } {
  const eventId = webhook.event.id;
  const duplicate = processedEventIds.has(eventId);
  const next = new Set(processedEventIds);
  if (!duplicate && webhook.verified) next.add(eventId);
  const obj = webhook.event.data.object;
  const amountCents = obj.object === "checkout.session" ? obj.amount_total : obj.total;

  return {
    processedEventIds: next,
    entry: {
      id: `whl_${eventId.slice(4, 16)}_${context.receivedAt.getTime().toString(36)}`,
      eventId,
      type: webhook.event.type,
      receivedAt: context.receivedAt.toISOString(),
      httpStatus: 200,
      signatureVerified: webhook.verified,
      outcome: duplicate ? "duplicate_ignored" : "processed",
      isReplay: context.isReplay,
      orderCode: context.orderCode,
      companyId: context.companyId,
      amountCents,
      webhook,
    },
  };
}
