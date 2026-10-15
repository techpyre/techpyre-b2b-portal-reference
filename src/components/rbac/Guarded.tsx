"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Lock } from "lucide-react";
import type { Permission } from "@/types";
import { can, ROLES } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";

export function PermBadge({ permission, granted }: { permission: Permission; granted?: boolean }) {
  return (
    <span
      className={`num inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] leading-none ${
        granted === false
          ? "border-danger/40 bg-danger/10 text-danger"
          : granted
            ? "border-ok/30 bg-ok/10 text-ok"
            : "border-line-strong bg-panel-2 text-muted"
      }`}
    >
      {granted === false && <Lock aria-hidden className="size-2.5" />}
      {permission}
    </span>
  );
}

type GuardedButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  permission: Permission;
  children: ReactNode;
  /** Motivo aggiuntivo di disabilitazione non legato all'RBAC (es. carrello vuoto). */
  blockedReason?: string | null;
  wrapperClassName?: string;
};

/**
 * Bottone protetto da permesso RBAC: se negato resta visibile ma disabilitato,
 * con tooltip «Permesso negato» e badge del permesso richiesto (accessibile da tastiera).
 */
export function GuardedButton({
  permission,
  children,
  blockedReason,
  className = "",
  wrapperClassName = "",
  ...rest
}: GuardedButtonProps) {
  const { role } = usePortal();
  const allowed = can(role, permission);
  const disabled = !allowed || Boolean(blockedReason) || Boolean(rest.disabled);
  const reason = !allowed ? `Permesso negato: ruolo ${ROLES[role].label}` : blockedReason;
  const { onClick, disabled: _ignored, ...buttonProps } = rest;
  void _ignored;

  return (
    <span className={`tip inline-flex ${wrapperClassName}`}>
      <button
        type="button"
        {...buttonProps}
        aria-disabled={disabled}
        data-permission={permission}
        onClick={(e) => {
          if (disabled) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
        className={`${className} aria-disabled:cursor-not-allowed aria-disabled:opacity-45`}
      >
        {!allowed && <Lock aria-hidden className="size-3.5 shrink-0" />}
        {children}
      </button>
      {reason && (
        <span role="tooltip" className="tip-body rounded-sm border border-line-strong bg-panel-2 px-2.5 py-2 text-left text-xs text-fg shadow-xl shadow-black/50">
          <span className="block font-medium">{reason}</span>
          {!allowed && (
            <span className="mt-1.5 flex items-center gap-1.5 text-muted">
              Richiede <PermBadge permission={permission} granted={false} />
            </span>
          )}
        </span>
      )}
      {!allowed && <span className="sr-only">{reason}. Permesso richiesto: {permission}.</span>}
    </span>
  );
}
