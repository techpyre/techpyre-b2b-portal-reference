#!/usr/bin/env node
/**
 * Sincronizza `prisma/schema.prisma` nella costante TypeScript mostrata dalla tab
 * «Ispezione Architettura». Lo schema resta l'unica fonte di verità.
 *
 *   node scripts/sync-prisma-schema.mjs          → rigenera il file TS
 *   node scripts/sync-prisma-schema.mjs --check  → fallisce se il file TS non è allineato
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(root, "prisma/schema.prisma");
const targetPath = resolve(root, "src/data/prisma-schema.generated.ts");

const schema = (await readFile(schemaPath, "utf8")).replace(/\r\n/g, "\n");
const output = [
  "/* File generato da scripts/sync-prisma-schema.mjs — non modificare a mano. */",
  "/* Fonte: prisma/schema.prisma */",
  "",
  `export const PRISMA_SCHEMA = ${JSON.stringify(schema)};`,
  "",
].join("\n");

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = await readFile(targetPath, "utf8");
  } catch {
    current = "";
  }
  if (current !== output) {
    console.error("✖ src/data/prisma-schema.generated.ts non è allineato a prisma/schema.prisma. Esegui: npm run sync:schema");
    process.exit(1);
  }
  console.log("✔ Schema Prisma sincronizzato.");
} else {
  await writeFile(targetPath, output, "utf8");
  console.log("✔ Generato src/data/prisma-schema.generated.ts");
}
