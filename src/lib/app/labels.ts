import { labelFromKey } from "$lib/runtime/ids.ts";
import type { AppSpec, TypeDef, ViewDef } from "$lib/runtime/model.ts";

export function collectionLabel(type: TypeDef): string {
  if (type.label.endsWith("s")) return type.label;
  return `${type.label}s`;
}

export function addLabel(type: TypeDef): string {
  return `Add ${type.label.toLowerCase()}`;
}

export function emptyCollectionTitle(type: TypeDef): string {
  return `No ${collectionLabel(type).toLowerCase()} yet`;
}

export function emptyCollectionDescription(type: TypeDef): string {
  return `Add the first ${type.label.toLowerCase()} to get started.`;
}

export function recordTitle(
  record: Record<string, unknown> | null | undefined,
  type?: TypeDef,
): string {
  if (!record) return type?.label ?? "Record";
  const value = record.name ?? record.title ?? record.number ?? record.email;
  if (value) return String(value);
  return type?.label ?? "Record";
}

export function columnLabel(path: string, type?: TypeDef): string {
  const [head, ...rest] = path.split(".");
  const field = type?.fields.find((item) => item.key === head);
  const base = field?.label ?? labelFromKey(head);
  if (!rest.length || rest[0] === "name") return base;
  return `${base} ${labelFromKey(rest.join("_"))}`;
}

export function featuredViews(spec: AppSpec): ViewDef[] {
  return spec.views.filter((view) => !view.implicit);
}

export function isBlankApp(spec: AppSpec): boolean {
  return !spec.types.some((type) => type.store === "local") && featuredViews(spec).length === 0;
}

export function isStatusPath(path: string): boolean {
  const leaf = path.split(".").at(-1);
  return leaf === "status";
}

export function isAmountPath(path: string): boolean {
  const leaf = path.split(".").at(-1) ?? "";
  return ["amount", "budget", "total", "price"].includes(leaf);
}

export function statusVariant(value: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = value.toLowerCase();
  if (["overdue", "rejected", "failed"].includes(normalized)) return "destructive";
  if (["paid", "complete", "completed", "active", "approved"].includes(normalized))
    return "default";
  return "secondary";
}

export function formatCell(path: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || isAmountPath(path)) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isNaN(numeric)) return numeric.toLocaleString();
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
  if (typeof value === "string" && /^[a-z0-9]+(?:_[a-z0-9]+)*$/i.test(value)) {
    return labelFromKey(value);
  }
  return String(value);
}

export function typeByKey(spec: AppSpec | undefined, key: string | undefined): TypeDef | undefined {
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

export function breadcrumbFor(path: string, spec?: AppSpec): Crumb[] {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return [{ label: "Home" }];
  if (parts[0] === "build") {
    const map: Record<string, string> = {
      types: "Data",
      views: "Views",
      forms: "Forms",
      flows: "Actions",
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
