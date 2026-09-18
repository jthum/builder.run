import { isId, labelFromKey } from "$lib/runtime/ids.ts";
import type { PageContext, FieldKind, ValueSemantic } from "$lib/blocks/presentation.ts";
import type { CollectionDraft, FieldDraft, ViewDraft } from "@jthum/framework/svelte/studio";
import { FIELD_CAPABILITIES, FIELD_KINDS } from "$lib/blocks/presentation.ts";
import { scalarString } from "$lib/runtime/values.ts";
import pluralize from "pluralize";

export const fieldKindLabel = Object.fromEntries(
  FIELD_KINDS.map((kind) => [kind, FIELD_CAPABILITIES[kind].label]),
) as Record<FieldKind, string>;

export const fieldKindHint = Object.fromEntries(
  FIELD_KINDS.map((kind) => [kind, FIELD_CAPABILITIES[kind].hint]),
) as Record<FieldKind, string>;

export function spaceLabel(name: string | undefined): string {
  if (!name || name === "Personal") return "Personal Space";
  return name;
}

export function collectionLabel(type: CollectionDraft): string {
  return type.collection_label?.trim() || defaultCollectionLabel(type.label);
}

export function defaultCollectionLabel(label: string): string {
  return pluralize.plural(label);
}

export function addLabel(type: CollectionDraft): string {
  return `Add ${type.label.toLowerCase()}`;
}

export function emptyCollectionTitle(type: CollectionDraft): string {
  return `No ${collectionLabel(type).toLowerCase()} yet`;
}

export function emptyCollectionDescription(type: CollectionDraft): string {
  return `Add the first ${type.label.toLowerCase()} to get started.`;
}

export function recordTitle(
  record: Record<string, unknown> | null | undefined,
  type?: CollectionDraft,
): string {
  if (!record) return type?.label ?? "Record";
  const value = record.name ?? record.title ?? record.number ?? record.email;
  if (value) return scalarString(value);
  return type?.label ?? "Record";
}

export function columnLabel(path: string, type?: CollectionDraft): string {
  const [head, ...rest] = path.split(".");
  const field = type?.fields.find((item) => item.key === head);
  const base = field?.label ?? labelFromKey(head);
  if (!rest.length || rest[0] === "name") return base;
  return `${base} ${labelFromKey(rest.join("_"))}`;
}

export function featuredViews(spec: PageContext): ViewDraft[] {
  return spec.views.filter((view) => !view.implicit);
}

export function homeViews(spec: PageContext): ViewDraft[] {
  const featured = featuredViews(spec);
  if (featured.length) return featured;
  return spec.types
    .filter((type) => !type.expose)
    .map((type) => spec.views.find((view) => view.source === type.key))
    .filter((view): view is ViewDraft => Boolean(view));
}

export function greeting(name?: string, at = new Date()): string {
  const hour = at.getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  if (!first || first.toLowerCase() === "you") return part;
  return `${part}, ${first}`;
}

export function listHref(view: ViewDraft): string {
  return view.implicit ? `/t/${view.source}` : `/v/${view.key}`;
}

export function isBlankApp(spec: PageContext): boolean {
  return !spec.types.some((type) => !type.expose) && featuredViews(spec).length === 0;
}

export function isStatusPath(path: string): boolean {
  const leaf = path.split(".").at(-1);
  return leaf === "status";
}

export function isAmountPath(path: string): boolean {
  const leaf = path.split(".").at(-1) ?? "";
  return ["amount", "budget", "total", "price"].includes(leaf);
}

export function aggregateRatingMax(
  view: ViewDraft,
  type: CollectionDraft | undefined,
  path: string,
): number | undefined {
  const measure = view.measures?.[path];
  if (!measure || measure.op !== "avg" || !type) return undefined;
  const keys = measure.fields?.length ? measure.fields : measure.field ? [measure.field] : [];
  if (!keys.length) return undefined;
  const fields = keys.map((key) => type.fields.find((field) => field.key === key));
  if (fields.some((field) => field?.type !== "number" || field.presentation !== "rating")) {
    return undefined;
  }
  const maxima = fields.map((field) => field?.max ?? 10);
  return maxima.every((maximum) => maximum === maxima[0]) ? maxima[0] : undefined;
}

export function statusVariant(value: string): "default" | "secondary" | "destructive" | "outline" {
  const tone = statusTone(value);
  if (tone === "danger") return "destructive";
  if (tone === "success") return "default";
  return "secondary";
}

export type StatusTone = ValueSemantic;

export function statusTone(value: string): StatusTone {
  const normalized = value.toLowerCase();
  if (["overdue", "rejected", "failed", "suspended"].includes(normalized)) return "danger";
  if (["paid", "complete", "completed", "active", "approved"].includes(normalized))
    return "success";
  if (["pending", "submitted", "sent"].includes(normalized)) return "warning";
  if (["draft", "planned"].includes(normalized)) return "info";
  return "neutral";
}

export function statusDotClass(value: string): string {
  return semanticDotClass(statusTone(value));
}

export function semanticDotClass(semantic: ValueSemantic): string {
  switch (semantic) {
    case "success":
      return "bg-emerald-500";
    case "danger":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    case "info":
      return "bg-sky-500";
    default:
      return "bg-muted-foreground/45";
  }
}

export function fieldValueSemantic(field: FieldDraft, value: unknown): ValueSemantic | undefined {
  if (field.type !== "enum" || field.presentation !== "badge") return undefined;
  return field.value_semantics?.[scalarString(value)] ?? "neutral";
}

export function formatMoney(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric);
}

export function formatCell(
  path: string,
  value: unknown,
  options: { maximumFractionDigits?: number } = {},
): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || isAmountPath(path)) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isNaN(numeric)) {
      return isAmountPath(path)
        ? formatMoney(numeric)
        : numeric.toLocaleString(
            undefined,
            options.maximumFractionDigits === undefined
              ? undefined
              : { maximumFractionDigits: options.maximumFractionDigits },
          );
    }
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  }
  if (typeof value === "string" && isId(value)) return "—";
  if (typeof value === "string" && /^[a-z0-9]+(?:_[a-z0-9]+)*$/i.test(value)) {
    return labelFromKey(value);
  }
  return scalarString(value);
}

export function typeByKey(
  spec: PageContext | undefined,
  key: string | undefined,
): CollectionDraft | undefined {
  if (!spec || !key) return undefined;
  return spec.types.find((type) => type.key === key);
}

export function countLabel(count: number, noun: string): string {
  const lower = noun.toLowerCase();
  if (count === 0) return `None yet`;
  if (count === 1) {
    const singular = lower.endsWith("ies") ? `${lower.slice(0, -3)}y` : lower.replace(/s$/, "");
    return `1 ${singular}`;
  }
  return `${count} ${lower}`;
}

export type Crumb = { label: string; href?: string };

export function breadcrumbFor(path: string, spec?: PageContext): Crumb[] {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return [{ label: "Home" }];
  if (parts[0] === "build") {
    const map: Record<string, string> = {
      types: "Data",
      views: "Views",
      forms: "Forms",
      automations: "Automations",
      pages: "Pages",
      spec: "Export",
      actors: "People",
    };
    const crumbs: Crumb[] = [{ label: "Edit app", href: "/build" }];
    const section = parts[1];
    if (section) {
      crumbs.push({
        label: map[section] ?? labelFromKey(section),
        href: parts[2] ? `/build/${section}` : undefined,
      });
    }
    if (parts[2]) crumbs.push({ label: labelFromKey(parts[2]) });
    return crumbs;
  }
  if (parts[0] === "diagnostics") {
    return [{ label: "Edit app", href: "/build" }, { label: "Inspect" }];
  }
  if (parts[0] === "library") {
    return [
      { label: "Edit app", href: "/build" },
      { label: "Library", href: "/library/blocks" },
      ...(parts[1] ? [{ label: labelFromKey(parts[1]) }] : []),
    ];
  }
  if (parts[0] === "v") {
    const view = spec?.views.find((item) => item.key === parts[1]);
    return [{ label: "Home", href: "/" }, { label: view?.label ?? "List" }];
  }
  if (parts[0] === "p") {
    const page = spec?.pages.find((item) => item.key === parts[1]);
    return [{ label: "Home", href: "/" }, { label: page?.label ?? "Page" }];
  }
  if (parts[0] === "t") {
    const typeKey = parts[1] ?? "";
    const type = typeByKey(spec, typeKey);
    const crumbs: Crumb[] = [
      { label: "Home", href: "/" },
      {
        label: type ? collectionLabel(type) : labelFromKey(typeKey),
        href: parts[2] ? `/t/${typeKey}` : undefined,
      },
    ];
    if (parts[2] === "new") crumbs.push({ label: type ? addLabel(type) : "New" });
    else if (parts[2]) crumbs.push({ label: type?.label ?? "Details" });
    return crumbs;
  }
  return [{ label: "Home", href: "/" }, { label: labelFromKey(parts[0] ?? "") }];
}
