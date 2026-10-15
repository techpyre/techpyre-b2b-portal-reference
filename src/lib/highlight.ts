/**
 * Syntax highlighting minimale, scritto a mano (nessuna libreria):
 * tokenizzazione a regex per JSON e per lo schema Prisma.
 */

export type TokenKind =
  | "plain"
  | "comment"
  | "keyword"
  | "type"
  | "attribute"
  | "string"
  | "number"
  | "key"
  | "literal"
  | "punct"
  | "fn";

export interface Token {
  text: string;
  kind: TokenKind;
}

function tokenize(source: string, rules: ReadonlyArray<[RegExp, TokenKind]>): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) tokens.push({ text: plain, kind: "plain" });
    plain = "";
  };
  outer: while (i < source.length) {
    for (const [re, kind] of rules) {
      re.lastIndex = i;
      const m = re.exec(source);
      if (m && m.index === i && m[0].length > 0) {
        flush();
        tokens.push({ text: m[0], kind });
        i += m[0].length;
        continue outer;
      }
    }
    plain += source[i];
    i++;
  }
  flush();
  return tokens;
}

const JSON_RULES: ReadonlyArray<[RegExp, TokenKind]> = [
  [/"(?:[^"\\]|\\.)*"(?=\s*:)/y, "key"],
  [/"(?:[^"\\]|\\.)*"/y, "string"],
  [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, "number"],
  [/\b(?:true|false|null)\b/y, "literal"],
  [/[{}[\],:]/y, "punct"],
];

const PRISMA_RULES: ReadonlyArray<[RegExp, TokenKind]> = [
  [/\/\/[^\n]*/y, "comment"],
  [/"(?:[^"\\]|\\.)*"/y, "string"],
  [/@@?[A-Za-z.]+/y, "attribute"],
  [/\b(?:model|enum|generator|datasource)\b/y, "keyword"],
  [/\b(?:String|Int|Boolean|DateTime|Json|Decimal|BigInt|Float|Bytes)\b/y, "type"],
  [/\b(?:cuid|now|env|autoincrement|uuid)(?=\()/y, "fn"],
  [/\b(?:true|false|Cascade|Desc|Asc)\b/y, "literal"],
  [/\b[A-Z][A-Za-z0-9]*\b/y, "type"],
  [/\b\d+\b/y, "number"],
  [/[{}()[\]?=,:]/y, "punct"],
];

export function highlightJson(source: string): Token[] {
  return tokenize(source, JSON_RULES);
}

export function highlightPrisma(source: string): Token[] {
  return tokenize(source, PRISMA_RULES);
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "text-fg",
  comment: "text-dim italic",
  keyword: "text-amber font-medium",
  type: "text-info-soft",
  attribute: "text-[#c4b5fd]",
  string: "text-[#86efac]",
  number: "text-amber-soft",
  key: "text-info-soft",
  literal: "text-[#f0abfc]",
  punct: "text-muted",
  fn: "text-[#fde68a]",
};
