"use client";
import { useContext, useId, useState } from "react";
import { CatalogContext } from "./client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
export const CatalogForm = ({ title, action, scope = {}, initial, fields, preview, reset = false, button = "Tambah" }) => {
  const id = useId(), context = useContext(CatalogContext), [values, setValues] = useState(initial), group = useId();
  const change = (name, value) => {
    const next = { ...values, [name]: value }; setValues(next);
    if (reset) context.stageNew(id, { action, data: { ...scope, ...next }, required: fields.filter(field => field.required !== false).map(field => ({ name: field.name, label: field.label })) });
    if (!reset) context.stage(id, { action, data: { ...scope, ...next } }, preview ? { ...preview, values: next } : null);
  };
  return <fieldset aria-label={title} disabled={context.disabled} className="grid min-w-0 gap-6 rounded-lg border p-4" id={group}>
    <legend className="px-2 text-sm font-semibold">{title}</legend>
    <div className="grid min-w-0 gap-6 sm:grid-cols-2">{fields.map(field => {
      const controlId = id + field.name, required = field.required !== false;
      const props = { id: controlId, value: values[field.name] ?? "", required,
        onChange: event => change(field.name, field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value) };
      return <div key={field.name} className={'cms-form-field ' + (field.type === "textarea" ? "sm:col-span-2" : "")}>
        <Label htmlFor={controlId}>{field.label}{required ? " * (wajib)" : " (opsional)"}</Label>
        {field.options ? <NativeSelect {...props}>{field.options.map(option => <NativeSelectOption value={option.value} key={option.value}>{option.label}</NativeSelectOption>)}</NativeSelect> : field.type === "textarea" ? <Textarea {...props} maxLength={2000} /> : <Input {...props} type={field.type ?? "text"} min={field.type === "number" ? 0 : undefined} max={field.max} step={field.type === "number" ? 1 : undefined} maxLength={field.name === "title" ? 240 : 160} />}
      </div>;
    })}</div>
    {reset && <Button type="button" variant="outline" className="justify-self-start" onClick={() => {
      const controls = [...document.getElementById(group).querySelectorAll("input,select,textarea")];
      const invalid = controls.find(control => !control.checkValidity()); if (invalid) { invalid.reportValidity(); return; }
      context.add(action, { ...scope, ...values }); context.stageNew(id, null); setValues(initial);
    }}>{button}</Button>}
  </fieldset>;
};
export const orderField = { name: "sortOrder", label: "Urutan", type: "number", max: 2147483647 };
export const codeField = { name: "code", label: "Kode" };
export const TranslationForms = ({ title, action, scope, rows, table, match }) => {
  const row = rows.find(item => item.locale === "id" && Object.entries(match).every(([key, value]) => item[key] === value));
  return <CatalogForm title={title} action={action} scope={{ ...scope, locale: "id" }} initial={{ title: row?.title ?? "", description: row?.description ?? "" }} preview={{ table, match: { ...match, locale: "id" }, create: { ...scope, locale: "id" } }}
    fields={[{ name: "title", label: "Nama" }, { name: "description", label: "Deskripsi", type: "textarea", required: false }]} />;
};
