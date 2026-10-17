// shadcn/ui (MIT) dialog pattern on Radix primitives, adapted to JSX/arrow functions.
"use client";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
const Dialog = ({ ...props }) => <DialogPrimitive.Root data-slot="dialog" {...props} />;
const DialogContent = ({ className, children, closeLabel = "Tutup", closeDisabled = false, ...props }) => <DialogPrimitive.Portal>
  <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
  <DialogPrimitive.Content data-slot="dialog-content" className={cn("fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-background p-4 shadow-lg sm:max-w-lg sm:p-6", className)} {...props}>
    {children}
    <DialogPrimitive.Close disabled={closeDisabled} className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-40">
      <XIcon className="size-4" aria-hidden="true" /><span className="sr-only">{closeLabel}</span>
    </DialogPrimitive.Close>
  </DialogPrimitive.Content>
</DialogPrimitive.Portal>;
const DialogTitle = ({ className, ...props }) => <DialogPrimitive.Title data-slot="dialog-title" className={cn("pr-10 text-lg font-semibold", className)} {...props} />;
const DialogDescription = ({ className, ...props }) => <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
export { Dialog, DialogContent, DialogTitle, DialogDescription };
