"use client";
import { useId } from "react";
import { pageDefinitions } from "@/server/pages/templates.mjs";
const links = ["", ...["id", "en"].flatMap(locale => Object.values(pageDefinitions).map(page => "/" + locale + page.path))];
const SpanEditor = ({ spans, onChange, label, disabled }) => {
  const prefix = useId();
  return <div>
  {spans.map((span, index) => {
    const change = value => onChange(spans.map((item, i) => i === index ? value : item));
    return <fieldset className="cms-span" key={index} disabled={disabled}>
      <legend>{label} — bagian {index + 1}</legend>
      <label htmlFor={`${prefix}-${index}`}>Teks</label><textarea id={`${prefix}-${index}`} value={span.text} maxLength={4000} onChange={event => change({ ...span, text: event.target.value })} />
      {["bold", "italic"].map(mark => <label className="cms-checkbox" key={mark}>
        <input type="checkbox" checked={span.marks?.includes(mark) ?? false} onChange={event => change({ ...span,
          marks: event.target.checked ? [...(span.marks ?? []), mark] : (span.marks ?? []).filter(value => value !== mark) })} />
        {mark === "bold" ? "Tebal" : "Miring"}</label>)}
      <label>Tautan internal<select value={span.href ?? ""} onChange={event => {
        const { href: _href, ...rest } = span;
        change(event.target.value ? { ...rest, href: event.target.value } : rest);
      }}>{links.map(link => <option key={link} value={link}>{link || "Tanpa tautan"}</option>)}</select></label>
      <button type="button" onClick={() => onChange(spans.filter((_, i) => i !== index))}>Hapus bagian {index + 1}</button>
    </fieldset>;
  })}
  <button type="button" disabled={disabled || spans.length >= 100} onClick={() => onChange([...spans, { text: "" }])}>Tambah bagian teks</button>
</div>;
};
export const RichPreview = ({ document }) => {
  const inline = spans => spans.map((span, index) => {
    let node = span.text;
    if (span.marks?.includes("bold")) node = <strong>{node}</strong>;
    if (span.marks?.includes("italic")) node = <em>{node}</em>;
    if (span.href) node = <a href={span.href}>{node}</a>;
    return <span key={index}>{node}</span>;
  });
  return document.blocks.map((block, index) => {
    if (block.type === "paragraph") return <p key={index}>{inline(block.content)}</p>;
    if (block.type === "heading") { const Heading = block.level === 2 ? "h2" : "h3"; return <Heading key={index}>{inline(block.content)}</Heading>; }
    const List = block.ordered ? "ol" : "ul";
    return <List key={index}>{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</List>;
  });
};
const RichTextEditor = ({ value, onChange, label, disabled }) => {
  const blocks = value.blocks;
  const update = (index, block) => onChange({ blocks: blocks.map((item, i) => i === index ? block : item) });
  return <fieldset className="cms-rich" disabled={disabled}><legend>{label}</legend>
    {blocks.map((block, index) => <fieldset key={index} className="cms-block"><legend>Blok {index + 1}</legend>
      {block.type === "list" ? <>
        <label className="cms-checkbox"><input type="checkbox" checked={block.ordered} onChange={event => update(index, { ...block, ordered: event.target.checked })} />Daftar bernomor</label>
        {block.items.map((item, itemIndex) => <div key={itemIndex}>
          <SpanEditor spans={item} label={`Item ${itemIndex + 1}`} disabled={disabled} onChange={spans => update(index, {
            ...block, items: block.items.map((row, i) => i === itemIndex ? spans : row) })} />
          <button type="button" onClick={() => update(index, { ...block, items: block.items.filter((_, i) => i !== itemIndex) })}>Hapus item {itemIndex + 1}</button>
        </div>)}
        <button type="button" disabled={block.items.length >= 100} onClick={() => update(index, { ...block, items: [...block.items, [{ text: "" }]] })}>Tambah item</button>
      </> : <>
        <label>Jenis blok<select value={block.type === "heading" ? "h" + block.level : "paragraph"} onChange={event => update(index,
          event.target.value === "paragraph" ? { type: "paragraph", content: block.content } : { type: "heading", level: Number(event.target.value.slice(1)), content: block.content })}>
          <option value="paragraph">Paragraf</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option>
        </select></label>
        <SpanEditor spans={block.content} onChange={content => update(index, { ...block, content })} label={`Blok ${index + 1}`} disabled={disabled} />
      </>}
      <button type="button" disabled={index === 0} onClick={() => {
        const next = [...blocks]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange({ blocks: next });
      }}>Naikkan blok {index + 1}</button>
      <button type="button" onClick={() => onChange({ blocks: blocks.filter((_, i) => i !== index) })}>Hapus blok {index + 1}</button>
    </fieldset>)}
    <button type="button" disabled={blocks.length >= 100} onClick={() => onChange({ blocks: [...blocks, { type: "paragraph", content: [{ text: "" }] }] })}>Tambah paragraf</button>
    <button type="button" disabled={blocks.length >= 100} onClick={() => onChange({ blocks: [...blocks, { type: "list", ordered: false, items: [[{ text: "" }]] }] })}>Tambah daftar</button>
  </fieldset>;
};
export default RichTextEditor;
