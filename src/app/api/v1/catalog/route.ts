import type { NextRequest } from "next/server";
import type { AvailabilityFilter, ProductCategory } from "@/types";
import { CATEGORIES, INITIAL_STOCK, PRODUCTS } from "@/data/catalog";
import { can, isRole } from "@/lib/rbac";
import { apiError, json } from "@/lib/http";

function isCategory(value: string | null): value is ProductCategory {
  return value !== null && (CATEGORIES as readonly string[]).includes(value);
}

export function GET(request: NextRequest): Response {
  const params = request.nextUrl.searchParams;
  const role = params.get("role");
  if (!role) return apiError(401, "unauthenticated", "Parametro «role» mancante: sessione non identificata.");
  if (!isRole(role)) return apiError(400, "invalid_role", `Ruolo sconosciuto: ${role}.`);
  if (!can(role, "catalog:read")) return apiError(403, "forbidden", "Accesso al catalogo negato.", "catalog:read");

  const q = (params.get("q") ?? "").trim().toLowerCase();
  const category = params.get("category");
  const availabilityParam = params.get("availability");
  const availability: AvailabilityFilter =
    availabilityParam === "in_stock" || availabilityParam === "on_order" ? availabilityParam : "all";
  const showCost = can(role, "price:view_cost");

  const items = PRODUCTS.filter((p) => {
    const stock = INITIAL_STOCK[p.sku] ?? { BG: 0, BS: 0 };
    const total = stock.BG + stock.BS;
    if (q && !p.sku.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
    if (isCategory(category) && p.category !== category) return false;
    if (availability === "in_stock" && total === 0) return false;
    if (availability === "on_order" && total > 0) return false;
    return true;
  }).map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    maxPressureBar: p.maxPressureBar,
    flowLpm: p.flowLpm,
    temperatureC: { min: p.tempMinC, max: p.tempMaxC },
    weightKg: p.weightKg,
    listPriceCents: p.listPriceCents,
    ...(showCost ? { industrialCostCents: p.industrialCostCents } : {}),
    stock: INITIAL_STOCK[p.sku] ?? { BG: 0, BS: 0 },
    leadTimeDays: p.leadTimeDays,
    certifications: p.certifications,
  }));

  return json({
    status: "ok",
    role,
    count: items.length,
    fieldsRedacted: showCost ? [] : ["industrialCostCents"],
    items,
  });
}
