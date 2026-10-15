import type { ApiEndpointDoc } from "@/types";

/** Documentazione REST in stile OpenAPI 3.1 degli endpoint del portale. */
export const API_ENDPOINTS: readonly ApiEndpointDoc[] = [
  {
    id: "catalog",
    method: "GET",
    path: "/api/v1/catalog",
    summary: "Catalogo tecnico filtrabile",
    description:
      "Restituisce i componenti con specifiche, giacenze per magazzino e prezzo di listino. Il costo industriale è incluso solo per i ruoli con permesso price:view_cost (filtro applicato lato server).",
    roles: ["buyer", "tier1", "agent", "admin"],
    parameters: [
      { name: "role", location: "query", type: "Role", required: true, description: "Ruolo della sessione (in produzione derivato dal token, mai dal client)." },
      { name: "q", location: "query", type: "string", required: false, description: "Ricerca per SKU o nome." },
      { name: "category", location: "query", type: "ProductCategory", required: false, description: "Filtro categoria." },
      { name: "availability", location: "query", type: "in_stock | on_order", required: false, description: "Pronta consegna o su ordinazione." },
    ],
    requestExample: null,
    responseStatus: 200,
    responseExample: `{
  "status": "ok",
  "role": "buyer",
  "count": 1,
  "items": [{
    "sku": "VLK-CT03-24V",
    "name": "Valvola Direzionale CETOP 03 ATEX 4/3 24 V DC",
    "maxPressureBar": 350,
    "flowLpm": 80,
    "listPriceCents": 48600,
    "stock": { "BG": 42, "BS": 18 },
    "leadTimeDays": 10
  }]
}`,
    liveUrl: "/api/v1/catalog?q=CETOP",
  },
  {
    id: "quote",
    method: "GET",
    path: "/api/v1/pricing/quote",
    summary: "Quotazione a scaglioni per SKU e quantità",
    description:
      "Esegue lo stesso pricing engine del client (centesimi interi): listino → sconto contratto della P.IVA → scaglione volume. Margine e provvigione sono esposti solo all'Agente Commerciale.",
    roles: ["buyer", "tier1", "agent", "admin"],
    parameters: [
      { name: "sku", location: "query", type: "string", required: true, description: "Codice articolo." },
      { name: "qty", location: "query", type: "integer ≥ 1", required: true, description: "Quantità richiesta." },
      { name: "role", location: "query", type: "Role", required: true, description: "Ruolo della sessione." },
      { name: "company", location: "query", type: "lario | padana", required: false, description: "Cliente attivo (solo Agente e Amministrazione)." },
    ],
    requestExample: null,
    responseStatus: 200,
    responseExample: `{
  "status": "ok",
  "customer": { "vatNumber": "IT04928170961", "priceListTier": "OFFERTA_BASE" },
  "quote": {
    "sku": "VLK-CT03-24V",
    "quantity": 12,
    "listUnitCents": 48600,
    "contractUnitCents": 43740,
    "volumeTier": { "label": "10–49 pz", "discountBp": 800 },
    "netUnitCents": 40241,
    "lineNetCents": 482892
  }
}`,
    liveUrl: "/api/v1/pricing/quote?sku=VLK-CT03-24V&qty=12",
  },
  {
    id: "orders",
    method: "POST",
    path: "/api/v1/orders",
    summary: "Emissione ordine con ricalcolo server-side",
    description:
      "Valida la policy RBAC deny-by-default (order:submit, modalità di pagamento, esenzione IVA, override), ricalcola integralmente i totali ignorando i prezzi inviati dal client e restituisce il codice ordine. Il ruolo Amministrazione riceve 403.",
    roles: ["buyer", "tier1", "agent"],
    parameters: [
      { name: "Idempotency-Key", location: "header", type: "uuid", required: true, description: "Chiave univoca per evitare doppie emissioni in caso di retry." },
      { name: "body", location: "body", type: "OrderRequestBody", required: true, description: "Ruolo, cliente, righe, regime IVA, pagamento." },
    ],
    requestExample: `{
  "role": "tier1",
  "companyId": "padana",
  "vatRegime": "esente_art8",
  "paymentMethod": "bonifico_60_dffm",
  "lines": [{ "sku": "VLK-VMP-350", "quantity": 60, "overrideDiscountBp": 0 }]
}`,
    responseStatus: 201,
    responseExample: `{
  "status": "accepted",
  "orderCode": "VLK-ORD-2026-418273",
  "customerVat": "IT01928370154",
  "totals": {
    "taxableGoodsCents": 403860,
    "shippingCents": 0,
    "vatCents": 0,
    "stampDutyCents": 200,
    "grandTotalCents": 404060
  }
}`,
    liveUrl: "/api/v1/orders",
  },
  {
    id: "webhook",
    method: "POST",
    path: "/api/webhooks/stripe",
    summary: "Ricezione eventi Stripe firmati",
    description:
      "Verifica l'header Stripe-Signature (HMAC SHA-256 su «timestamp.payload», tolleranza 300 s, confronto a tempo costante). In produzione deduplica su event.id con vincolo di unicità e risponde sempre 2xx ai duplicati.",
    roles: "stripe",
    parameters: [
      { name: "Stripe-Signature", location: "header", type: "string", required: true, description: "t=<unix>,v1=<hex HMAC>." },
      { name: "body", location: "body", type: "Stripe.Event (raw)", required: true, description: "Payload grezzo, da verificare prima del parsing." },
    ],
    requestExample: `{
  "id": "evt_1Q9xV2...",
  "object": "event",
  "type": "checkout.session.completed",
  "data": { "object": { "amount_total": 404060, "currency": "eur" } }
}`,
    responseStatus: 200,
    responseExample: `{
  "received": true,
  "signatureVerified": true,
  "eventId": "evt_1Q9xV2...",
  "type": "checkout.session.completed"
}`,
    liveUrl: null,
  },
  {
    id: "invoice-xml",
    method: "GET",
    path: "/api/v1/invoices/{id}/xml",
    summary: "Esportazione XML FatturaPA (FPR12)",
    description:
      "Genera il tracciato FatturaPA della fattura con natura N3.5 per le dichiarazioni d'intento e bollo virtuale. Nella sandbox il file è prodotto lato client dalla stessa funzione pura.",
    roles: ["admin"],
    parameters: [{ name: "id", location: "path", type: "string", required: true, description: "Identificativo fattura (inv_AAAA_NNNNNN)." }],
    requestExample: null,
    responseStatus: 200,
    responseExample: `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" ...>
  <FatturaElettronicaHeader>…</FatturaElettronicaHeader>
  <FatturaElettronicaBody>…</FatturaElettronicaBody>
</p:FatturaElettronica>`,
    liveUrl: null,
  },
];
