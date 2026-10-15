import type { NextRequest } from "next/server";
import { PRICE_LIST_TIERS } from "@/data/companies";
import { findProduct } from "@/data/catalog";
import { can, isRole } from "@/lib/rbac";
import { quote } from "@/lib/pricing";
import { isCompanyId, resolveCompany } from "@/lib/orders";
import { apiError, json } from "@/lib/http";

export function GET(request: NextRequest): Response {
  const params = request.nextUrl.searchParams;
  const role = params.get("role");
  if (!role) return apiError(401, "unauthenticated", "Parametro «role» mancante: sessione non identificata.");
  if (!isRole(role)) return apiError(400, "invalid_role", `Ruolo sconosciuto: ${role}.`);
  if (!can(role, "price:view_contract")) {
    return apiError(403, "forbidden", "Prezzi da contratto non visibili per il ruolo.", "price:view_contract");
  }

  const sku = params.get("sku") ?? "";
  const product = findProduct(sku);
  if (!product) return apiError(404, "sku_not_found", `Articolo non trovato: ${sku || "(vuoto)"}.`);

  const qtyRaw = params.get("qty") ?? "";
  const qty = Number(qtyRaw);
  if (!/^\d+$/.test(qtyRaw) || !Number.isSafeInteger(qty) || qty < 1 || qty > 100_000) {
    return apiError(422, "invalid_quantity", "Il parametro «qty» deve essere un intero tra 1 e 100000.");
  }

  const companyParam = params.get("company");
  const company = resolveCompany(role, isCompanyId(companyParam) ? companyParam : null);
  const tier = PRICE_LIST_TIERS[company.priceListTier];
  const q = quote(product, tier, qty);

  return json({
    status: "ok",
    role,
    customer: { legalName: company.legalName, vatNumber: company.vatNumber, priceListTier: tier.id, contractCode: tier.contractCode },
    quote: {
      sku: q.sku,
      quantity: q.quantity,
      listUnitCents: q.listUnitCents,
      contractDiscountBp: q.contractDiscountBp,
      contractUnitCents: q.contractUnitCents,
      volumeTier: { id: q.volumeTier.id, label: q.volumeTier.label, discountBp: q.volumeTier.discountBp },
      compoundDiscountBp: q.compoundDiscountBp,
      exactNetUnitPriceCents: q.exactNetUnitPriceCents,
      netUnitCents: q.netUnitCents,
      lineListCents: q.lineListCents,
      lineNetCents: q.lineNetCents,
      savingsCents: q.savingsCents,
      ...(can(role, "price:view_cost") ? { costUnitCents: q.costUnitCents } : {}),
      ...(can(role, "price:view_margin")
        ? { marginBp: q.marginBp, commissionRateBp: q.commissionRateBp, commissionCents: q.commissionCents }
        : {}),
    },
    availableTiers: tier.volumeTiers.map((t) => ({ label: t.label, discountBp: t.discountBp })),
  });
}
