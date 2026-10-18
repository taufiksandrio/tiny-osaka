import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import { formatPrice } from "@/server/public/view-models.mjs";
import ProductCardImage from "./ProductCardImage";
import ProductOrderCard from "./ProductOrderCard";

// Server-rendered card content (name, description, price stay in the HTML without JS). Only the trigger and dialog
// live in the client shell. Shared by the home highlights, /menu and "Menu lainnya".
const firstImage = (catalog, product) => catalog.media.find(media => media.productId === product.id && media.asset.kind === "image");

export const ProductCard = ({ product, image, headingLevel: Heading = "h2", priority = false, orderable = true }) => (
  <ProductOrderCard title={product.title} orderLinks={orderable ? product.orderLinks ?? [] : []}
    price={<p className="product-card-price">{formatPrice(product.price)}</p>}>
    <ProductCardImage media={image} priority={priority} />
    <CardContent className="product-card-body">
      <Heading className="product-card-title"><Link href={`/menu/${product.slug}`}>{product.title}</Link></Heading>
      {product.description && <p className="product-card-description">{product.description}</p>}
    </CardContent>
  </ProductOrderCard>
);

export const ProductGrid = ({ catalog, products, headingLevel = "h2", priorityFirst = false, columns, orderable = true }) => (
  <ul className={`product-grid${columns === 3 ? " product-grid-3" : ""}`} role="list">
    {products.map((product, index) => <li key={product.id}>
      <ProductCard product={product} image={firstImage(catalog, product)} headingLevel={headingLevel} priority={priorityFirst && index === 0} orderable={orderable} />
    </li>)}
  </ul>
);
