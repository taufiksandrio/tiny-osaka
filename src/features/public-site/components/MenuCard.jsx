import Link from "next/link";

const MenuCard = ({ copy, item }) => (
  <article className="menu-card">
    <div className={`menu-placeholder tone-${item.tone}`}>
      <span className="sample-tag">{copy.sample}</span>
      <span className="slot-number" aria-hidden="true">{item.number}</span>
      <span className="photo-note">{copy.photo}</span>
    </div>
    <div className="menu-card-copy">
      <h3>{copy.itemLabel} {item.number}</h3>
      <p>{copy.itemDescription}</p>
      <span className="item-status">{copy.itemStatus}</span>
      <Link className="text-link card-link" href={`/menu/${item.slug}`}>
        {copy.viewSample}<span aria-hidden="true">→</span>
        <span className="sr-only"> — {copy.itemLabel} {item.number}</span>
      </Link>
    </div>
  </article>
);

export default MenuCard;
