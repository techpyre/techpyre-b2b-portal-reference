"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CompanyId, Role } from "@/types";
import { isRole, ROLES } from "@/lib/rbac";
import { isCompanyId } from "@/lib/orders";

/**
 * Sessione demo (ruolo + cliente attivo) sincronizzata con l'URL (`?role=&company=`)
 * e con localStorage: il link è condivisibile e il cambio ruolo è istantaneo, senza reload.
 * `useSyncExternalStore` evita mismatch di idratazione: il prerender usa lo snapshot server.
 */

const EVENT = "valkiria:session";
const STORAGE_ROLE = "valkiria.role";
const STORAGE_COMPANY = "valkiria.company";
const SERVER_SNAPSHOT = "buyer|lario";

export interface DemoSession {
  role: Role;
  companyId: CompanyId;
}

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage non disponibile (navigazione privata): l'URL resta la fonte di verità */
  }
}

function getSnapshot(): string {
  const params = new URLSearchParams(window.location.search);
  const urlRole = params.get("role");
  const storedRole = safeStorageGet(STORAGE_ROLE);
  const role: Role = isRole(urlRole) ? urlRole : isRole(storedRole) ? storedRole : "buyer";
  const def = ROLES[role];
  let companyId: CompanyId = def.defaultCompanyId;
  if (def.canSwitchCompany) {
    const urlCompany = params.get("company");
    const storedCompany = safeStorageGet(STORAGE_COMPANY);
    if (isCompanyId(urlCompany)) companyId = urlCompany;
    else if (isCompanyId(storedCompany)) companyId = storedCompany;
  }
  return `${role}|${companyId}`;
}

function getServerSnapshot(): string {
  return SERVER_SNAPSHOT;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function writeSession(role: Role, companyId: CompanyId): void {
  const url = new URL(window.location.href);
  url.searchParams.set("role", role);
  if (ROLES[role].canSwitchCompany) url.searchParams.set("company", companyId);
  else url.searchParams.delete("company");
  window.history.replaceState(window.history.state, "", url);
  safeStorageSet(STORAGE_ROLE, role);
  if (ROLES[role].canSwitchCompany) safeStorageSet(STORAGE_COMPANY, companyId);
  window.dispatchEvent(new Event(EVENT));
}

export function useDemoSession(): DemoSession & {
  setRole: (role: Role) => void;
  setCompany: (companyId: CompanyId) => void;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [roleRaw, companyRaw] = snapshot.split("|");
  const role: Role = isRole(roleRaw) ? roleRaw : "buyer";
  const companyId: CompanyId = isCompanyId(companyRaw) ? companyRaw : ROLES[role].defaultCompanyId;

  const setRole = useCallback(
    (next: Role) => {
      const def = ROLES[next];
      writeSession(next, def.canSwitchCompany && ROLES[role].canSwitchCompany ? companyId : def.defaultCompanyId);
    },
    [role, companyId],
  );
  const setCompany = useCallback(
    (next: CompanyId) => {
      if (ROLES[role].canSwitchCompany) writeSession(role, next);
    },
    [role],
  );

  return { role, companyId, setRole, setCompany };
}
