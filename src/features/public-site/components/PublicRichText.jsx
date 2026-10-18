import Link from "next/link";
import { isInternalPageLink } from "@/server/pages/templates.mjs";
const Inline = ({ spans }) => spans.map((span, index) => {
  let node = span.text;
  if (span.marks?.includes("bold")) node = <strong>{node}</strong>;
  if (span.marks?.includes("italic")) node = <em>{node}</em>;
  if (span.href && isInternalPageLink(span.href)) node = <Link href={span.href}>{node}</Link>;
  return <span key={index}>{node}</span>;
});
const Block = ({ block }) => {
  if (block.type === "paragraph") return <p><Inline spans={block.content} /></p>;
  if (block.type === "heading") { const Heading = block.level === 2 ? "h2" : "h3"; return <Heading><Inline spans={block.content} /></Heading>; }
  const List = block.ordered ? "ol" : "ul";
  return <List>{block.items.map((item, i) => <li key={i}><Inline spans={item} /></li>)}</List>;
};
// Wrapped in the shared prose class (reading width, rhythm, visible lists and links). Renders nothing when empty.
const PublicRichText = ({ document, className = "" }) => document?.blocks?.length
  ? <div className={`site-prose ${className}`.trim()}>{document.blocks.map((block, index) => <Block key={index} block={block} />)}</div>
  : null;
export default PublicRichText;
