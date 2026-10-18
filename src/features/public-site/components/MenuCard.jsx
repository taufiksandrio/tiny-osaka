import Link from "next/link";
import { ArrowRight, UtensilsCrossed } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

// Fixture-mode card: same shape as the real product card, but the photo box is a labelled placeholder
// ("Contoh") and there is deliberately no price and no order button (the fixture has no such data).
export const SamplePhoto = ({ tag, note, number }) => (
  <div className="product-card-image sample-photo">
    <span className="product-card-image-empty" aria-hidden="true"><UtensilsCrossed className="size-10" /></span>
    {number && <span className="sample-photo-number" aria-hidden="true">{number}</span>}
    <span className="sample-photo-tag">{tag}</span>
    {note && <span className="sample-photo-note">{note}</span>}
  </div>
);

const MenuCard = ({ copy, item, headingLevel: Heading = "h3" }) => (
  <Card className="product-card">
    <SamplePhoto tag={copy.sample} note={copy.photo} number={item.number} />
    <CardContent className="product-card-body">
      <Heading className="product-card-title">{copy.itemLabel} {item.number}</Heading>
      <p className="product-card-description">{copy.itemDescription}</p>
    </CardContent>
    <CardFooter className="product-card-footer">
      <p className="product-card-status">{copy.itemStatus}</p>
      <Link className="product-card-link" href={`/menu/${item.slug}`}>{copy.viewSample}<ArrowRight className="size-4" aria-hidden="true" />
        <span className="sr-only"> — {copy.itemLabel} {item.number}</span></Link>
    </CardFooter>
  </Card>
);

export const MenuCardGrid = ({ items, copy, headingLevel }) => (
  <ul className="product-grid" role="list">
    {items.map(item => <li key={item.id}><MenuCard item={item} copy={copy} headingLevel={headingLevel} /></li>)}
  </ul>
);

export default MenuCard;
