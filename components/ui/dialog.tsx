"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content className={"dialog " + (wide ? "dialog-wide" : "")}>
          <div className="dialog-heading">
            <div>
              <D.Title>{title}</D.Title>
              <D.Description>
                {description || "Управляйте библиотекой в одном месте"}
              </D.Description>
            </div>
            <D.Close className="close" aria-label="Закрыть">
              <X size={20} />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
