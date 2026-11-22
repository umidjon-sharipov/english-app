"use client";

import React, { useEffect } from "react";

interface UiModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export function UiModal({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = "max-w-2xl",
  children,
}: UiModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-700/80 bg-neutral-900 text-neutral-100 shadow-2xl p-5 md:p-6 space-y-4`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 pb-3">
          <div>
            <h2 className="text-base md:text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs opacity-70 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs hover:border-neutral-500 cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
