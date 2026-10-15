import type { Company, CompanyId, PriceListTier, ContractTierId } from "@/types";

/** Anagrafica del fornitore (cedente/prestatore) — azienda fittizia. */
export const SUPPLIER = {
  legalName: "Valkiria Fluidodinamica S.r.l.",
  vatNumber: "IT03918270164",
  fiscalCode: "03918270164",
  rea: "BG-418273",
  shareCapital: "500.000,00 € i.v.",
  address: {
    street: "Via dell'Industria 48",
    postalCode: "24040",
    city: "Comun Nuovo",
    province: "BG",
    country: "IT" as const,
  },
  pec: "amministrazione@pec.valkiria-fluido.example",
  iban: "IT60X0542811101000000123456",
} as const;

export const PRICE_LIST_TIERS: Record<ContractTierId, PriceListTier> = {
  OFFERTA_BASE: {
    id: "OFFERTA_BASE",
    label: "Offerta Base",
    contractCode: "OB-2026-0417",
    contractDiscountBp: 1_000,
    volumeTiers: [
      { id: "T1", minQty: 1, maxQty: 9, discountBp: 0, label: "1–9 pz" },
      { id: "T2", minQty: 10, maxQty: 49, discountBp: 800, label: "10–49 pz" },
      { id: "T3", minQty: 50, maxQty: null, discountBp: 1_500, label: "50+ pz" },
    ],
  },
  CONTRATTO_QUADRO: {
    id: "CONTRATTO_QUADRO",
    label: "Contratto Quadro Tier-1",
    contractCode: "CQ-2026-0032",
    contractDiscountBp: 2_800,
    volumeTiers: [
      { id: "T1", minQty: 1, maxQty: 9, discountBp: 0, label: "1–9 pz" },
      { id: "T2", minQty: 10, maxQty: 49, discountBp: 1_000, label: "10–49 pz" },
      { id: "T3", minQty: 50, maxQty: null, discountBp: 1_800, label: "50+ pz" },
    ],
  },
};

/** Aziende clienti fittizie. */
export const COMPANIES: Record<CompanyId, Company> = {
  lario: {
    id: "lario",
    legalName: "Officine Meccaniche Lario S.p.A.",
    vatNumber: "IT04928170961",
    sdiRecipientCode: "M5UXCR1",
    pec: "ufficio.acquisti@pec.officinelario.example",
    email: "acquisti@officinelario.example",
    address: { street: "Via Statale 36, 112", postalCode: "23900", city: "Lecco", province: "LC", country: "IT" },
    priceListTier: "OFFERTA_BASE",
    freeShippingThresholdCents: 150_000,
    intentDeclarationProtocol: null,
    stripeCustomerId: "cus_Q8vLario4928",
  },
  padana: {
    id: "padana",
    legalName: "Idraulica Padana Distribuzione S.r.l.",
    vatNumber: "IT01928370154",
    sdiRecipientCode: "T04ZHR3",
    pec: "amministrazione@pec.idraulicapadana.example",
    email: "ordini@idraulicapadana.example",
    address: { street: "Via Emilia Ovest 1290", postalCode: "41123", city: "Modena", province: "MO", country: "IT" },
    priceListTier: "CONTRATTO_QUADRO",
    freeShippingThresholdCents: 80_000,
    intentDeclarationProtocol: "26011512345678901-000001",
    stripeCustomerId: "cus_Q8vPadana1928",
  },
};

/** Costo di trasporto standard (resa franco partenza) sotto soglia. */
export const SHIPPING_FEE_CENTS = 1_850;
/** Aliquota IVA ordinaria. */
export const VAT_STANDARD_BP = 2_200;
