import type { CheckoutTotals, Company, Invoice, InvoiceLine, PaymentMethod, VatRegime } from "@/types";
import { SUPPLIER } from "@/data/companies";
import { centsToDecimal } from "@/lib/money";

/** Formatta una data come `AAAA-MM-GG` nel fuso orario locale. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Scadenza «60 gg data fattura fine mese»: +60 giorni, poi ultimo giorno del mese risultante. */
export function dueDateDffm(issue: Date, days = 60): Date {
  const plus = new Date(issue.getFullYear(), issue.getMonth(), issue.getDate() + days);
  return new Date(plus.getFullYear(), plus.getMonth() + 1, 0);
}

export const PAYMENT_CODES: Record<PaymentMethod, { modalita: string; label: string }> = {
  bonifico_60_dffm: { modalita: "MP05", label: "MP05 · Bonifico" },
  stripe_card: { modalita: "MP08", label: "MP08 · Carta di pagamento" },
  stripe_sepa_debit: { modalita: "MP21", label: "MP21 · SEPA Direct Debit B2B" },
};

export interface InvoiceInput {
  sequence: number;
  orderCode: string;
  issuedAt: Date;
  customer: Company;
  totals: CheckoutTotals;
  vatRegime: VatRegime;
  paymentMethod: PaymentMethod;
}

/** Progressivo invio SDI: 5 caratteri alfanumerici (base 36). */
export function progressivoInvio(sequence: number): string {
  return sequence.toString(36).toUpperCase().padStart(5, "0");
}

export function buildInvoice(input: InvoiceInput): Invoice {
  const { sequence, orderCode, issuedAt, customer, totals, vatRegime, paymentMethod } = input;
  const year = issuedAt.getFullYear();
  const progressivo = progressivoInvio(sequence);
  const lines: InvoiceLine[] = totals.lines.map((l, i) => ({
    lineNumber: i + 1,
    sku: l.product.sku,
    description: l.product.name,
    quantity: l.quote.quantity,
    unitCents: l.quote.netUnitCents,
    totalCents: l.quote.lineNetCents,
  }));
  const sdiDigits = crypto.getRandomValues(new Uint32Array(2));
  const sdiIdentifier = `${(sdiDigits[0] % 90_000 + 10_000).toString()}${String(sdiDigits[1] % 100_000).padStart(5, "0")}`;
  const due = paymentMethod === "bonifico_60_dffm" ? dueDateDffm(issuedAt) : issuedAt;

  return {
    id: `inv_${year}_${String(sequence).padStart(6, "0")}`,
    number: `FV-${year}/${String(sequence).padStart(6, "0")}`,
    issueDate: isoDate(issuedAt),
    dueDate: isoDate(due),
    orderCode,
    customer,
    lines,
    shippingCents: totals.shippingCents,
    taxableCents: totals.taxableTotalCents,
    vatRegime,
    vatCents: totals.vatCents,
    stampDutyCents: totals.stampDutyCents,
    totalCents: totals.grandTotalCents,
    paymentMethod,
    sdiStatus: "IN_ELABORAZIONE",
    sdiIdentifier,
    sdiFileName: `IT${SUPPLIER.fiscalCode}_${progressivo}.xml`,
    progressivoInvio: progressivo,
  };
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function el(tag: string, value: string, indent: number): string {
  return `${"  ".repeat(indent)}<${tag}>${esc(value)}</${tag}>`;
}

function block(tag: string, children: string[], indent: number): string {
  const pad = "  ".repeat(indent);
  return [`${pad}<${tag}>`, ...children, `${pad}</${tag}>`].join("\n");
}

function vatNumberCode(vat: string): string {
  return vat.replace(/^IT/, "");
}

/**
 * Tracciato FatturaPA FPR12 (fattura tra privati, versione 1.2.x) — sottoinsieme
 * plausibile dei blocchi obbligatori, con natura N3.5 per la dichiarazione d'intento
 * e rivalsa del bollo virtuale (natura N1).
 */
export function buildFatturaPaXml(invoice: Invoice): string {
  const exempt = invoice.vatRegime === "esente_art8";
  const aliquota = exempt ? "0.00" : "22.00";
  const natura = exempt ? [el("Natura", "N3.5", 4)] : [];
  const customer = invoice.customer;
  const protocol = customer.intentDeclarationProtocol ?? "";
  const pay = PAYMENT_CODES[invoice.paymentMethod];

  const detailLines: string[] = invoice.lines.map((l, idx) =>
    block(
      "DettaglioLinee",
      [
        el("NumeroLinea", String(l.lineNumber), 4),
        block("CodiceArticolo", [el("CodiceTipo", "SKU", 5), el("CodiceValore", l.sku, 5)], 4),
        el("Descrizione", l.description, 4),
        el("Quantita", `${l.quantity}.00`, 4),
        el("UnitaMisura", l.sku.startsWith("VLK-TFS") ? "MT" : "PZ", 4),
        el("PrezzoUnitario", centsToDecimal(l.unitCents), 4),
        el("PrezzoTotale", centsToDecimal(l.totalCents), 4),
        el("AliquotaIVA", aliquota, 4),
        ...natura,
        ...(exempt && idx === 0
          ? [
              block(
                "AltriDatiGestionali",
                [el("TipoDato", "INTENTO", 5), el("RiferimentoTesto", protocol, 5), el("RiferimentoData", invoice.issueDate, 5)],
                4,
              ),
            ]
          : []),
      ],
      3,
    ),
  );

  let next = invoice.lines.length + 1;
  if (invoice.shippingCents > 0) {
    detailLines.push(
      block(
        "DettaglioLinee",
        [
          el("NumeroLinea", String(next++), 4),
          el("TipoCessionePrestazione", "AC", 4),
          el("Descrizione", "Spese di trasporto", 4),
          el("Quantita", "1.00", 4),
          el("PrezzoUnitario", centsToDecimal(invoice.shippingCents), 4),
          el("PrezzoTotale", centsToDecimal(invoice.shippingCents), 4),
          el("AliquotaIVA", aliquota, 4),
          ...natura,
        ],
        3,
      ),
    );
  }
  if (invoice.stampDutyCents > 0) {
    detailLines.push(
      block(
        "DettaglioLinee",
        [
          el("NumeroLinea", String(next++), 4),
          el("Descrizione", "Rivalsa imposta di bollo assolta in modo virtuale", 4),
          el("Quantita", "1.00", 4),
          el("PrezzoUnitario", centsToDecimal(invoice.stampDutyCents), 4),
          el("PrezzoTotale", centsToDecimal(invoice.stampDutyCents), 4),
          el("AliquotaIVA", "0.00", 4),
          el("Natura", "N1", 4),
        ],
        3,
      ),
    );
  }

  const summaries: string[] = [
    block(
      "DatiRiepilogo",
      [
        el("AliquotaIVA", aliquota, 4),
        ...natura,
        el("ImponibileImporto", centsToDecimal(invoice.taxableCents), 4),
        el("Imposta", centsToDecimal(invoice.vatCents), 4),
        ...(exempt
          ? [el("RiferimentoNormativo", `Non imponibile art. 8 c.1 lett. c) DPR 633/72 - Dich. intento prot. ${protocol}`, 4)]
          : [el("EsigibilitaIVA", "I", 4)]),
      ],
      3,
    ),
  ];
  if (invoice.stampDutyCents > 0) {
    summaries.push(
      block(
        "DatiRiepilogo",
        [
          el("AliquotaIVA", "0.00", 4),
          el("Natura", "N1", 4),
          el("ImponibileImporto", centsToDecimal(invoice.stampDutyCents), 4),
          el("Imposta", "0.00", 4),
          el("RiferimentoNormativo", "Escluso art. 15 DPR 633/72", 4),
        ],
        3,
      ),
    );
  }

  const header = block(
    "FatturaElettronicaHeader",
    [
      block(
        "DatiTrasmissione",
        [
          block("IdTrasmittente", [el("IdPaese", "IT", 4), el("IdCodice", SUPPLIER.fiscalCode, 4)], 3),
          el("ProgressivoInvio", invoice.progressivoInvio, 3),
          el("FormatoTrasmissione", "FPR12", 3),
          el("CodiceDestinatario", customer.sdiRecipientCode, 3),
        ],
        2,
      ),
      block(
        "CedentePrestatore",
        [
          block(
            "DatiAnagrafici",
            [
              block("IdFiscaleIVA", [el("IdPaese", "IT", 5), el("IdCodice", vatNumberCode(SUPPLIER.vatNumber), 5)], 4),
              el("CodiceFiscale", SUPPLIER.fiscalCode, 4),
              block("Anagrafica", [el("Denominazione", SUPPLIER.legalName, 5)], 4),
              el("RegimeFiscale", "RF01", 4),
            ],
            3,
          ),
          block(
            "Sede",
            [
              el("Indirizzo", SUPPLIER.address.street, 4),
              el("CAP", SUPPLIER.address.postalCode, 4),
              el("Comune", SUPPLIER.address.city, 4),
              el("Provincia", SUPPLIER.address.province, 4),
              el("Nazione", "IT", 4),
            ],
            3,
          ),
          block(
            "IscrizioneREA",
            [
              el("Ufficio", "BG", 4),
              el("NumeroREA", SUPPLIER.rea.replace(/^BG-/, ""), 4),
              el("CapitaleSociale", "500000.00", 4),
              el("SocioUnico", "SM", 4),
              el("StatoLiquidazione", "LN", 4),
            ],
            3,
          ),
        ],
        2,
      ),
      block(
        "CessionarioCommittente",
        [
          block(
            "DatiAnagrafici",
            [
              block("IdFiscaleIVA", [el("IdPaese", "IT", 5), el("IdCodice", vatNumberCode(customer.vatNumber), 5)], 4),
              block("Anagrafica", [el("Denominazione", customer.legalName, 5)], 4),
            ],
            3,
          ),
          block(
            "Sede",
            [
              el("Indirizzo", customer.address.street, 4),
              el("CAP", customer.address.postalCode, 4),
              el("Comune", customer.address.city, 4),
              el("Provincia", customer.address.province, 4),
              el("Nazione", "IT", 4),
            ],
            3,
          ),
        ],
        2,
      ),
    ],
    1,
  );

  const body = block(
    "FatturaElettronicaBody",
    [
      block(
        "DatiGenerali",
        [
          block(
            "DatiGeneraliDocumento",
            [
              el("TipoDocumento", "TD01", 4),
              el("Divisa", "EUR", 4),
              el("Data", invoice.issueDate, 4),
              el("Numero", invoice.number, 4),
              ...(invoice.stampDutyCents > 0
                ? [block("DatiBollo", [el("BolloVirtuale", "SI", 5), el("ImportoBollo", centsToDecimal(invoice.stampDutyCents), 5)], 4)]
                : []),
              el("ImportoTotaleDocumento", centsToDecimal(invoice.totalCents), 4),
              el("Causale", `Fornitura componenti oleodinamici — ordine ${invoice.orderCode}`, 4),
            ],
            3,
          ),
          block("DatiOrdineAcquisto", [el("RiferimentoNumeroLinea", "1", 4), el("IdDocumento", invoice.orderCode, 4)], 3),
        ],
        2,
      ),
      block("DatiBeniServizi", [...detailLines, ...summaries], 2),
      block(
        "DatiPagamento",
        [
          el("CondizioniPagamento", "TP02", 3),
          block(
            "DettaglioPagamento",
            [
              el("ModalitaPagamento", pay.modalita, 4),
              el("DataScadenzaPagamento", invoice.dueDate, 4),
              el("ImportoPagamento", centsToDecimal(invoice.totalCents), 4),
              ...(invoice.paymentMethod === "bonifico_60_dffm" ? [el("IBAN", SUPPLIER.iban, 4)] : []),
            ],
            3,
          ),
        ],
        2,
      ),
    ],
    1,
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">',
    header,
    body,
    "</p:FatturaElettronica>",
    "",
  ].join("\n");
}
