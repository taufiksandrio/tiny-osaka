import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

// Article card for /guides (published and fixture). `cover` is a 4:3 node (CMS photo or labelled placeholder).
const GuideCard = ({ title, summary, href, cover, readLabel = "Baca", headingLevel: Heading = "h2" }) => (
  <Card className="product-card guide-card">
    {cover}
    <CardContent className="product-card-body">
      <Heading className="product-card-title"><Link href={href}>{title}</Link></Heading>
      {summary && <p className="product-card-description guide-summary">{summary}</p>}
    </CardContent>
    <CardFooter className="product-card-footer">
      <Link className="product-card-link" href={href}>{readLabel}<ArrowRight className="size-4" aria-hidden="true" /><span className="sr-only"> — {title}</span></Link>
    </CardFooter>
  </Card>
);

export const GuideGrid = ({ children }) => <ul className="product-grid" role="list">{children}</ul>;

export default GuideCard;
