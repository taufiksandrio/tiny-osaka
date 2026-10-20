"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { Card, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import PlatformIcon from "./PlatformIcon";
import { trackClickOrder } from "../analytics.mjs";
import { ORDER_LINK_REL, normalizeOrderLinks, orderAriaLabel } from "./order-platforms.mjs";

// Card shell around server-rendered children (photo + text) and a server-rendered price. Clicking the card (or the
// "Pesan" button) opens a dialog with one button per available platform. No links: plain card, no trigger, nothing
// opens. The dialog sits outside the card so portal events never bubble back into the card click handler.
const ProductOrderCard = ({ title, orderLinks, price, children, productSlug, placement = "menu_card" }) => {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const links = normalizeOrderLinks(orderLinks);
  const openDialog = () => { trigger.current?.focus(); setOpen(true); };
  const onCardClick = event => { if (!event.target.closest("a, button")) openDialog(); };
  const orderable = links.length > 0;
  return <>
    <Card className={`product-card${orderable ? " cursor-pointer" : ""}`} onClick={orderable ? onCardClick : undefined}>
      {children}
      <CardFooter className="product-card-footer">
        {price}
        {orderable && <Button ref={trigger} type="button" onClick={openDialog} aria-haspopup="dialog" className="product-card-order">
          <ShoppingBag aria-hidden="true" />Pesan</Button>}
      </CardFooter>
    </Card>
    {orderable && <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[min(24rem,calc(100%-1rem))] motion-reduce:animate-none">
        <DialogTitle className="break-words">{title}</DialogTitle>
        <DialogDescription>Pilih aplikasi untuk memesan.</DialogDescription>
        <ul className="m-0 grid list-none gap-3 p-0">
          {links.map(link => <li key={link.id}>
            <a href={link.href} target="_blank" rel={ORDER_LINK_REL} onClick={() => trackClickOrder({ platform: link.id, productSlug, placement })} aria-label={orderAriaLabel(link)}
              className="order-platform-link flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 font-semibold hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
              <PlatformIcon platform={link.id} /><span className="flex-1">{link.label}</span><ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </li>)}
        </ul>
      </DialogContent>
    </Dialog>}
  </>;
};
export default ProductOrderCard;
