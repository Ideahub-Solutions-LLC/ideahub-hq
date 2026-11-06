"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";

export function Button({ variant = "secondary", size, className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm"; children: ReactNode }) {
  return (
    <button className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Submit button that reflects the pending state of the enclosing form action. */
export function SubmitButton({ children, pendingText, variant = "primary", size, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; pendingText?: string; variant?: Variant; size?: "sm" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`} disabled={pending || rest.disabled} aria-busy={pending} {...rest}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

/** Asks for confirmation before submitting the enclosing form. */
export function ConfirmSubmitButton({ confirm, children, variant = "danger", size, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { confirm: string; children: ReactNode; variant?: Variant; size?: "sm" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
      disabled={pending || rest.disabled}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
      {...rest}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
