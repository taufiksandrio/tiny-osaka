"use client";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { pageDefinitions } from "@/server/pages/templates.mjs";
const links = ["", ...["id"].flatMap(locale => Object.values(pageDefinitions).map(page => "/" + locale + page.path))];
const SpanEditor = ({ spans, onChange, label, disabled, children }) => {
  const prefix = useId();
  return <div className="grid min-w-0 gap-6">
  {spans.map((span, index) => {
    const change = value => onChange(spans.map((item, i) => i === index ? value : item));
    return <div className="grid min-w-0 gap-6 border-t pt-4" key={index} role="group" aria-label={`${label} — bagian ${index + 1}`}>
      <p className="text-xs font-medium text-muted-foreground">Bagian teks {index + 1}</p>
      <div className="cms-form-field"><Label htmlFor={`${prefix}-${index}`}>Teks</Label><Textarea id={`${prefix}-${index}`} value={span.text} maxLength={4000} onChange={event => change({ ...span, text: event.target.value })} /></div>
      <div className="flex flex-wrap gap-5">{["bold", "italic"].map(mark => <Label className="cms-checkbox" key={mark}>
        <Checkbox disabled={disabled} checked={span.marks?.includes(mark) ?? false} onCheckedChange={checked => change({ ...span,
          marks: checked === true ? [...(span.marks ?? []), mark] : (span.marks ?? []).filter(value => value !== mark) })} />
        {mark === "bold" ? "Tebal" : "Miring"}</Label>)}</div>
      <div className="cms-form-field"><Label htmlFor={`${prefix}-${index}-link`}>Tautan internal</Label><NativeSelect id={`${prefix}-${index}-link`} value={span.href ?? ""} onChange={event => {
        const { href: _href, ...rest } = span;
        change(event.target.value ? { ...rest, href: event.target.value } : rest);
      }}>{links.map(link => <NativeSelectOption key={link} value={link}>{link || "Tanpa tautan"}</NativeSelectOption>)}</NativeSelect></div>
      <div className="cms-button-row"><Button variant="ghost" size="sm" type="button" onClick={() => onChange(spans.filter((_, i) => i !== index))}>Hapus bagian {index + 1}</Button></div>
    </div>;
  })}
  <div className="cms-button-row"><Button variant="outline" size="sm" type="button" disabled={disabled || spans.length >= 100} onClick={() => onChange([...spans, { text: "" }])}>Tambah bagian teks</Button>{children}</div>
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
  const prefix = useId();
  const blocks = value.blocks;
  const update = (index, block) => onChange({ blocks: blocks.map((item, i) => i === index ? block : item) });
  return <fieldset className="cms-rich" disabled={disabled}><legend>{label}</legend>
    <p className="text-sm text-muted-foreground">Susun paragraf, judul, atau daftar. Format dan tautan berlaku pada setiap bagian teks.</p>
    {blocks.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Belum ada blok konten. Tambahkan paragraf atau daftar di bawah.</p>}
    {blocks.map((block, index) => <Card key={index} className="min-w-0 gap-4 py-4 shadow-none" role="group" aria-label={`Blok ${index + 1}`}>
      <CardHeader className="px-4"><h3>Blok {index + 1} · {block.type === "list" ? "Daftar" : block.type === "heading" ? "Judul" : "Paragraf"}</h3></CardHeader>
      <CardContent className="grid min-w-0 gap-6 px-4">
      {block.type === "list" ? <>
        <Label className="cms-checkbox"><Checkbox disabled={disabled} checked={block.ordered} onCheckedChange={checked => update(index, { ...block, ordered: checked === true })} />Daftar bernomor</Label>
        {block.items.map((item, itemIndex) => <div key={itemIndex} className="grid min-w-0 gap-6">
          <p className="text-sm font-medium">Item {itemIndex + 1}</p>
          <SpanEditor spans={item} label={`Item ${itemIndex + 1}`} disabled={disabled} onChange={spans => update(index, {
            ...block, items: block.items.map((row, i) => i === itemIndex ? spans : row) })}>
            <Button variant="ghost" size="sm" type="button" onClick={() => update(index, { ...block, items: block.items.filter((_, i) => i !== itemIndex) })}>Hapus item {itemIndex + 1}</Button>
          </SpanEditor>
        </div>)}
        <div className="cms-button-row"><Button variant="outline" size="sm" type="button" disabled={block.items.length >= 100} onClick={() => update(index, { ...block, items: [...block.items, [{ text: "" }]] })}>Tambah item</Button></div>
      </> : <>
        <div className="cms-form-field"><Label htmlFor={`${prefix}-${index}-type`}>Jenis blok</Label><NativeSelect id={`${prefix}-${index}-type`} value={block.type === "heading" ? "h" + block.level : "paragraph"} onChange={event => update(index,
          event.target.value === "paragraph" ? { type: "paragraph", content: block.content } : { type: "heading", level: Number(event.target.value.slice(1)), content: block.content })}>
          <NativeSelectOption value="paragraph">Paragraf</NativeSelectOption><NativeSelectOption value="h2">Heading 2</NativeSelectOption><NativeSelectOption value="h3">Heading 3</NativeSelectOption>
        </NativeSelect></div>
        <SpanEditor spans={block.content} onChange={content => update(index, { ...block, content })} label={`Blok ${index + 1}`} disabled={disabled} />
      </>}
      </CardContent><CardFooter className="cms-button-row border-t px-4 pt-4">
      <Button variant="outline" size="sm" type="button" disabled={index === 0} onClick={() => {
        const next = [...blocks]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange({ blocks: next });
      }}>Naikkan blok {index + 1}</Button>
      <Button variant="ghost" size="sm" type="button" onClick={() => onChange({ blocks: blocks.filter((_, i) => i !== index) })}>Hapus blok {index + 1}</Button>
      </CardFooter>
    </Card>)}
    <div className="cms-button-row">
    <Button variant="outline" size="sm" type="button" disabled={blocks.length >= 100} onClick={() => onChange({ blocks: [...blocks, { type: "paragraph", content: [{ text: "" }] }] })}>Tambah paragraf</Button>
    <Button variant="outline" size="sm" type="button" disabled={blocks.length >= 100} onClick={() => onChange({ blocks: [...blocks, { type: "list", ordered: false, items: [[{ text: "" }]] }] })}>Tambah daftar</Button>
    </div>
  </fieldset>;
};
export default RichTextEditor;
