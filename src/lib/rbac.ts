import type { Permission, PermissionDefinition, Role, RoleDefinition } from "@/types";

export const ROLES: Record<Role, RoleDefinition> = {
  buyer: {
    id: "buyer",
    label: "Buyer Tecnico",
    shortLabel: "Buyer",
    description: "Offerta Base · sconto 10% · P.IVA IT04928170961",
    defaultCompanyId: "lario",
    canSwitchCompany: false,
  },
  tier1: {
    id: "tier1",
    label: "Key Account / Distributore Tier-1",
    shortLabel: "Tier-1",
    description: "Contratto Quadro · sconto 28% + scaglioni volume · P.IVA IT01928370154",
    defaultCompanyId: "padana",
    canSwitchCompany: false,
  },
  agent: {
    id: "agent",
    label: "Agente Commerciale",
    shortLabel: "Agente",
    description: "Vista margini, provvigioni e override listino",
    defaultCompanyId: "lario",
    canSwitchCompany: true,
  },
  admin: {
    id: "admin",
    label: "Amministrazione & Contabilità",
    shortLabel: "Amministrazione",
    description: "Fatture SDI, esportazione XML, log webhook Stripe",
    defaultCompanyId: "padana",
    canSwitchCompany: true,
  },
};

export const ROLE_ORDER: readonly Role[] = ["buyer", "tier1", "agent", "admin"];

export const PERMISSIONS: readonly PermissionDefinition[] = [
  { id: "catalog:read", label: "Consultazione catalogo tecnico" },
  { id: "price:view_contract", label: "Prezzi netti da contratto" },
  { id: "price:view_cost", label: "Costo industriale" },
  { id: "price:view_margin", label: "Margini e provvigioni" },
  { id: "price:override", label: "Override listino (sconto extra)" },
  { id: "cart:edit", label: "Gestione carrello" },
  { id: "order:submit", label: "Emissione ordine" },
  { id: "payment:stripe", label: "Pagamento Stripe (carta / SEPA DD)" },
  { id: "payment:deferred_terms", label: "Bonifico 60 gg DFFM" },
  { id: "tax:exemption_declare", label: "Esenzione IVA art. 8 c.1 lett. c)" },
  { id: "invoice:read", label: "Consultazione fatture SDI" },
  { id: "invoice:export_xml", label: "Esportazione XML FatturaPA" },
  { id: "webhook:read_log", label: "Log webhook Stripe" },
  { id: "webhook:replay", label: "Replay eventi webhook" },
  { id: "architecture:inspect", label: "Ispezione architettura" },
];

/**
 * Matrice permessi deny-by-default: un permesso non elencato è negato.
 * In produzione la stessa matrice è valutata lato server (middleware + route handler).
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  buyer: new Set<Permission>([
    "catalog:read",
    "price:view_contract",
    "cart:edit",
    "order:submit",
    "payment:stripe",
    "architecture:inspect",
  ]),
  tier1: new Set<Permission>([
    "catalog:read",
    "price:view_contract",
    "cart:edit",
    "order:submit",
    "payment:stripe",
    "payment:deferred_terms",
    "tax:exemption_declare",
    "architecture:inspect",
  ]),
  agent: new Set<Permission>([
    "catalog:read",
    "price:view_contract",
    "price:view_cost",
    "price:view_margin",
    "price:override",
    "cart:edit",
    "order:submit",
    "payment:deferred_terms",
    "architecture:inspect",
  ]),
  admin: new Set<Permission>([
    "catalog:read",
    "price:view_contract",
    "price:view_cost",
    "invoice:read",
    "invoice:export_xml",
    "webhook:read_log",
    "webhook:replay",
    "architecture:inspect",
  ]),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function isRole(value: unknown): value is Role {
  return value === "buyer" || value === "tier1" || value === "agent" || value === "admin";
}

export function deniedReason(role: Role, permission: Permission): string {
  return `Permesso negato · ruolo «${ROLES[role].shortLabel}» privo di ${permission}`;
}
