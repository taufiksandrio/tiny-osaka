import Link from "next/link";
import { isInternalPageLink } from "@/server/pages/templates.mjs";
// Links saved before ADR-038 may start with /id or /en; render them without the language segment.
const publicHref = href => href.replace(/^\/(?:id|en)(?=\/|$)/, "") || "/";
const Inline = ({ spans }) => spans.map((span, index) => {
  let node = span.text;
  if (span.marks?.includes("bold")) node = <strong>{node}</strong>;
  if (span.marks?.includes("italic")) node = <em>{node}</em>;
  if (span.href && isInternalPageLink(span.href)) node = <Link href={publicHref(span.href)}>{node}</Link>;
  return <span key={index}>{node}</span>;
});
const PublicRichText = ({ document }) => document?.blocks.map((block, index) => {
  if (block.type === "paragraph") return <p key={index}><Inline spans={block.content} /></p>;
  if (block.type === "heading") { const Heading = block.level === 2 ? "h2" : "h3"; return <Heading key={index}><Inline spans={block.content} /></Heading>; }
  const List = block.ordered ? "ol" : "ul";
  return <List key={index}>{block.items.map((item, i) => <li key={i}><Inline spans={item} /></li>)}</List>;
});
export default PublicRichText;
