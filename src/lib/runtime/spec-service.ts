import { assertValidAutomation } from "./automation/validate.ts";
import { defaultViewFields, effectiveSpec } from "./defaults.ts";
import { conditionFieldKeys, renameConditionField } from "./field-state.ts";
import { createSpecId, labelFromKey, slugify } from "./ids.ts";
import {
  cloneData,
  cloneSpec,
  isExposed,
  normalizeField,
  normalizeFieldKey,
  normalizeSpec,
  normalizeTypeLifecycle,
  normalizeView,
  validateFieldCapabilities,
  type AppSpec,
  type FieldDef,
  type FormDef,
  type FormDraft,
  type PageDef,
  type TypeDef,
  type TypeDraft,
  type ViewDef,
  type WorkflowDef,
} from "./model.ts";
import { guessPageIcon, normalizePageIcon } from "./page-icons.ts";
import type { SpaceState } from "./platform.ts";
import { specFromText, specToJson, specToYaml } from "./serialize.ts";
import {
  findFieldReferences,
  findTypeReferences,
  rewriteFieldReferences,
  rewriteTypeReferences,
  type SpecReference,
} from "./spec-references.ts";
import { scalarString } from "./values.ts";
import { configurePageRows, normalizePageRows } from "./blocks.ts";

export interface SpecChange {
  id: string;
  spec: AppSpec;
}

export interface SpecServiceContext {
  app(): SpaceState;
  space(): SpaceState;
  apps(): SpaceState[];
  resolvedSpec(): AppSpec;
  commit(changes: SpecChange[]): Promise<void>;
}

/**
 * Owns authored application-definition changes. Runtime persistence and schema
 * materialisation remain behind the context's single transactional commit.
 */
export class SpecService {
  constructor(private readonly context: SpecServiceContext) {}

  async upsertType(draft: TypeDraft & { key: string }): Promise<TypeDef> {
    draft = cloneData(draft);
    const expose = Boolean(draft.expose);
    const target = expose ? this.context.space() : this.context.app();
    const spec = cloneSpec(target.spec);
    const next = normalizeSpec(
      {
        ...spec,
        types: {
          ...Object.fromEntries(spec.types.map((type) => [type.key, type])),
          [draft.key]: { ...draft, ...(expose ? { expose: true } : {}), store: "local" },
        },
      },
      spec,
    );
    await this.context.commit([{ id: target.id, spec: next }]);
    return this.owner(target.id).spec.types.find((item) => item.key === draft.key) as TypeDef;
  }

  async renameType(from: string, to: string): Promise<TypeDef> {
    const { owner, spec, type } = this.writableTypeDraft(from);
    const key = slugify(to);
    if (!key) throw new Error("Type key required");
    if (key === from) return this.findWritableType(from);
    if (key === "_meta") throw new Error('Type key "_meta" is reserved by the runtime');
    this.assertTypeRenameAvailable(owner, type, from, key);

    type.key = key;
    await this.context.commit(this.rewriteTypeInConsumers(owner, spec, from, key));
    return this.findWritableType(key);
  }

  async deleteType(key: string): Promise<void> {
    const app = this.context.app();
    const space = this.context.space();
    const references = this.typeReferences(key).filter(
      (reference) => !(reference.owner === "type" && reference.key === key),
    );
    if (references.length) throw referencedByError("type", key, references);
    const changes = new Map<string, AppSpec>();
    changes.set(app.id, {
      ...cloneSpec(app.spec),
      types: app.spec.types.filter((type) => type.key !== key),
    });
    changes.set(space.id, {
      ...cloneSpec(space.spec),
      types: space.spec.types.filter((type) => type.key !== key),
    });
    await this.context.commit([...changes].map(([id, spec]) => ({ id, spec })));
  }

  async renameField(typeKey: string, from: string, to: string): Promise<FieldDef> {
    const { owner, spec, type } = this.writableTypeDraft(typeKey);
    const field = type.fields.find((item) => item.key === from);
    if (!field) throw new Error(`Unknown field ${from}`);
    const key = normalizeFieldKey(to);
    if (type.fields.some((item) => item !== field && item.key === key)) {
      throw new Error(`Field key "${key}" already exists on ${typeKey}`);
    }
    const nextFields = type.fields.map((item) => {
      const renamed =
        item === field
          ? {
              ...item,
              key,
              label: item.label === labelFromKey(from) ? labelFromKey(key) : item.label,
            }
          : { ...item };
      for (const property of ["visible_when", "enabled_when", "required_when"] as const) {
        if (renamed[property]) {
          renamed[property] = renameConditionField(renamed[property], from, key);
        }
      }
      return renamed;
    });
    const lifecycle = type.lifecycle
      ? normalizeTypeLifecycle(
          { ...type, fields: nextFields },
          {
            ...type.lifecycle,
            field: type.lifecycle.field === from ? key : type.lifecycle.field,
          },
        )
      : undefined;
    type.fields = nextFields;
    if (lifecycle) type.lifecycle = lifecycle;
    await this.context.commit(this.rewriteFieldInConsumers(owner, spec, typeKey, from, key));
    return this.findWritableType(typeKey).fields.find((item) => item.key === key) as FieldDef;
  }

  async deleteField(typeKey: string, key: string): Promise<void> {
    const { owner, spec, type } = this.writableTypeDraft(typeKey);
    if (type.lifecycle?.field === key) {
      throw new Error(`Cannot delete lifecycle field "${key}" while the lifecycle is configured`);
    }
    type.fields = type.fields
      .filter((item) => item.key !== key)
      .map((item) => {
        const next = { ...item };
        for (const property of ["visible_when", "enabled_when", "required_when"] as const) {
          if (next[property] && conditionFieldKeys(next[property]).includes(key)) {
            delete next[property];
          }
        }
        if (!next.visible_when) delete next.hidden_value;
        return next;
      });
    const references = this.fieldReferences(typeKey, key, { owner, spec });
    if (references.length) throw referencedByError("field", `${typeKey}.${key}`, references);
    await this.context.commit([{ id: owner.id, spec }]);
  }

  async upsertField(
    typeKey: string,
    field: Partial<FieldDef> & { key: string },
  ): Promise<FieldDef> {
    field = cloneData(field);
    const { owner, spec, type } = this.writableTypeDraft(typeKey);
    const key = normalizeFieldKey(field.key);
    const existing = type.fields.find((item) => item.key === key);
    const label =
      String(field.label ?? "").trim() || String(existing?.label ?? "").trim() || labelFromKey(key);
    const updated = normalizeField(
      key,
      {
        id: existing?.id ?? createSpecId(),
        type: "text",
        ...existing,
        ...field,
        key,
        label,
      } as FieldDef,
      existing,
    );
    const next = existing
      ? type.fields.map((item) => (item.key === key ? updated : item))
      : [...type.fields, updated];
    validateFieldCapabilities(type.key, next);
    if (type.lifecycle) normalizeTypeLifecycle({ ...type, fields: next }, type.lifecycle);
    type.fields = next;
    await this.context.commit([{ id: owner.id, spec }]);
    return this.findWritableType(typeKey).fields.find((item) => item.key === key) as FieldDef;
  }

  async reorderFields(typeKey: string, keys: string[]): Promise<TypeDef> {
    keys = cloneData(keys);
    const { owner, spec, type } = this.writableTypeDraft(typeKey);
    const map = new Map(type.fields.map((field) => [field.key, field]));
    const next = keys
      .map((key) => map.get(key))
      .filter((field): field is FieldDef => Boolean(field));
    for (const field of type.fields) {
      if (!keys.includes(field.key)) next.push(field);
    }
    type.fields = next;
    await this.context.commit([{ id: owner.id, spec }]);
    return this.findWritableType(typeKey);
  }

  async upsertView(draft: Partial<ViewDef> & { key: string }): Promise<ViewDef> {
    draft = cloneData(draft);
    const app = this.context.app();
    const spec = cloneSpec(app.spec);
    const existing = spec.views.find((view) => view.key === draft.key);
    const groupBy = draft.group_by ?? existing?.group_by;
    const suppliedFields = Object.hasOwn(draft, "fields");
    if (!groupBy && suppliedFields && draft.fields?.length === 0) {
      throw new Error(
        `View "${draft.key}" needs at least one field. Omit fields to choose useful defaults automatically.`,
      );
    }
    if (!existing && !groupBy && !suppliedFields) {
      const source = this.context.resolvedSpec().types.find((type) => type.key === draft.source);
      if (!source) throw new Error(`Unknown source type "${draft.source ?? ""}"`);
      draft.fields = defaultViewFields(source);
    }
    const views = upsertNamed(
      spec.views,
      normalizeView({
        id: existing?.id || createSpecId(),
        label: labelFromKey(draft.key),
        source: "",
        fields: [],
        ...existing,
        ...draft,
        key: draft.key,
        implicit: false,
      }),
    );
    await this.context.commit([{ id: app.id, spec: { ...spec, views } }]);
    return this.context.app().spec.views.find((item) => item.key === draft.key) as ViewDef;
  }

  async upsertForm(draft: FormDraft & { key: string }): Promise<FormDef> {
    draft = cloneData(draft);
    const app = this.context.app();
    const spec = cloneSpec(app.spec);
    const existing = spec.forms.find((form) => form.key === draft.key);
    const candidate = {
      id: existing?.id || createSpecId(),
      label: labelFromKey(draft.key),
      mode: draft.type ? "create" : "standalone",
      ...existing,
      ...draft,
      key: draft.key,
      implicit: false,
    } as FormDraft & { id: string; key: string; label: string; mode: FormDef["mode"] };
    if (existing?.inputs && Array.isArray(candidate.inputs)) {
      const existingById = new Map(existing.inputs.map((input) => [input.id, input]));
      for (const input of candidate.inputs) {
        if (typeof input === "string" || !input.id || !input.key) continue;
        const previous = existingById.get(input.id);
        if (!previous || previous.key === input.key) continue;
        for (const sibling of candidate.inputs) {
          if (typeof sibling === "string") continue;
          for (const property of ["visible_when", "enabled_when", "required_when"] as const) {
            if (sibling[property]) {
              sibling[property] = renameConditionField(sibling[property], previous.key, input.key);
            }
          }
        }
      }
    }
    const next = normalizeSpec({ ...spec, forms: upsertNamed(spec.forms, candidate) }, spec);
    await this.context.commit([{ id: app.id, spec: next }]);
    return this.context.app().spec.forms.find((item) => item.key === draft.key) as FormDef;
  }

  async upsertWorkflow(draft: Partial<WorkflowDef> & { key: string }): Promise<WorkflowDef> {
    draft = cloneData(draft);
    const app = this.context.app();
    const spec = cloneSpec(app.spec);
    const existing = spec.workflows.find((workflow) => workflow.key === draft.key);
    const workflows = upsertNamed(spec.workflows, {
      label: labelFromKey(draft.key),
      steps: [],
      ...existing,
      ...draft,
      id: existing?.id || draft.id || createSpecId(),
    });
    assertValidAutomation(workflows.find((item) => item.key === draft.key));
    await this.context.commit([{ id: app.id, spec: { ...spec, workflows } }]);
    return this.context.app().spec.workflows.find((item) => item.key === draft.key) as WorkflowDef;
  }

  async upsertPage(draft: Partial<PageDef> & { key: string }): Promise<PageDef> {
    draft = cloneData(draft);
    const app = this.context.app();
    const spec = cloneSpec(app.spec);
    const existing = spec.pages.find((page) => page.key === draft.key);
    const folder = draft.folder !== undefined ? folderName(draft.folder) : existing?.folder;
    const blocks =
      draft.blocks !== undefined
        ? configurePageRows(this.context.resolvedSpec(), draft.blocks)
        : normalizePageRows(existing?.blocks ?? []);
    let icon = existing?.icon;
    if (draft.icon !== undefined) {
      icon = normalizePageIcon(draft.icon);
      if (!icon) throw new Error(`Invalid page icon "${scalarString(draft.icon)}"`);
    } else if (!existing) {
      icon = guessPageIcon(blocks);
    }
    const pages = upsertNamed(spec.pages, {
      id: existing?.id || createSpecId(),
      label: labelFromKey(draft.key),
      ...existing,
      ...draft,
      folder,
      icon,
      implicit: false,
      blocks,
    });
    await this.context.commit([{ id: app.id, spec: { ...spec, pages } }]);
    return this.context.app().spec.pages.find((item) => item.key === draft.key) as PageDef;
  }

  async deleteView(key: string): Promise<void> {
    await this.deleteNamed("views", key);
  }

  async deleteForm(key: string): Promise<void> {
    await this.deleteNamed("forms", key);
  }

  async deleteWorkflow(key: string): Promise<void> {
    await this.deleteNamed("workflows", key);
  }

  async deletePage(key: string): Promise<void> {
    await this.deleteNamed("pages", key);
  }

  async replaceAuthoredPages(pages: PageDef[]): Promise<void> {
    pages = cloneData(pages);
    const app = this.context.app();
    const spec = cloneSpec(app.spec);
    const keep = spec.pages.filter((page) => page.key === "home" || page.path === "/");
    const authored = pages
      .filter((page) => !page.implicit && page.key !== "home" && page.path !== "/")
      .map((page) => ({
        ...page,
        folder: page.folder?.trim() || undefined,
        blocks: cloneData(page.blocks ?? []),
      }));
    await this.context.commit([{ id: app.id, spec: { ...spec, pages: [...keep, ...authored] } }]);
  }

  async apply(input: unknown): Promise<AppSpec> {
    const app = this.context.app();
    const next = normalizeSpec(cloneData(input) as never, app.spec);
    const localKeys = new Set(next.types.map((type) => type.key));
    const exposed = this.context
      .space()
      .spec.types.filter((type) => isExposed(type) && !localKeys.has(type.key));
    const validationSpec = effectiveSpec({
      ...cloneSpec(next),
      types: [...cloneData(exposed), ...next.types],
    });
    for (const page of next.pages) page.blocks = configurePageRows(validationSpec, page.blocks);
    await this.context.commit([{ id: app.id, spec: next }]);
    return this.context.resolvedSpec();
  }

  async replaceText(text: string): Promise<AppSpec> {
    return this.apply(specFromText(text));
  }

  exportJson(): string {
    return specToJson(effectiveSpec(this.context.app().spec));
  }

  exportYaml(): string {
    return specToYaml(effectiveSpec(this.context.app().spec));
  }

  fieldReferences(
    typeKey: string,
    fieldKey: string,
    candidate?: { owner: SpaceState; spec: AppSpec },
  ): SpecReference[] {
    const owner = candidate?.owner ?? this.writableTypeDraft(typeKey).owner;
    const ownerSpec = candidate?.spec ?? owner.spec;
    const references = findFieldReferences(ownerSpec, typeKey, fieldKey);
    if (owner.id !== this.context.space().id) return references;

    for (const app of this.context.apps()) {
      if (app.spec.types.some((type) => type.key === typeKey)) continue;
      const composite = specWithSharedTypes(app.spec, ownerSpec);
      references.push(
        ...findFieldReferences(composite, typeKey, fieldKey)
          .filter((reference) => reference.owner !== "type")
          .map((reference) => scopedReference(app, reference)),
      );
    }
    return uniqueReferences(references);
  }

  typeReferences(typeKey: string): SpecReference[] {
    const local = this.context.app().spec.types.some((type) => type.key === typeKey);
    const owner = local ? this.context.app() : this.context.space();
    const references = findTypeReferences(owner.spec, typeKey);
    if (local) return references;

    for (const app of this.context.apps()) {
      if (app.spec.types.some((type) => type.key === typeKey)) continue;
      const composite = specWithSharedTypes(app.spec, owner.spec);
      references.push(
        ...findTypeReferences(composite, typeKey)
          .filter((reference) => reference.owner !== "type")
          .map((reference) => scopedReference(app, reference)),
      );
    }
    return uniqueReferences(references);
  }

  private async deleteNamed(
    collection: "views" | "forms" | "workflows" | "pages",
    key: string,
  ): Promise<void> {
    const app = this.context.app();
    const spec = cloneSpec(app.spec);
    const next = spec[collection].filter((item) => item.key !== key);
    await this.context.commit([{ id: app.id, spec: { ...spec, [collection]: next } }]);
  }

  private owner(id: string): SpaceState {
    const owner = [this.context.space(), this.context.app(), ...this.context.apps()].find(
      (item) => item.id === id,
    );
    if (!owner) throw new Error(`Unknown spec owner ${id}`);
    return owner;
  }

  private findWritableType(typeKey: string): TypeDef {
    const local = this.context.app().spec.types.find((type) => type.key === typeKey);
    if (local) return local;
    const shared = this.context.space().spec.types.find((type) => type.key === typeKey);
    if (shared) return shared;
    throw new Error(`Unknown type ${typeKey}`);
  }

  private writableTypeDraft(typeKey: string): {
    owner: SpaceState;
    spec: AppSpec;
    type: TypeDef;
  } {
    const owner = this.context.app().spec.types.some((type) => type.key === typeKey)
      ? this.context.app()
      : this.context.space().spec.types.some((type) => type.key === typeKey)
        ? this.context.space()
        : undefined;
    if (!owner) throw new Error(`Unknown type ${typeKey}`);
    const spec = cloneSpec(owner.spec);
    const type = spec.types.find((item) => item.key === typeKey);
    if (!type) throw new Error(`Unknown type ${typeKey}`);
    return { owner, spec, type };
  }

  private rewriteFieldInConsumers(
    owner: SpaceState,
    ownerSpec: AppSpec,
    typeKey: string,
    from: string,
    to: string,
  ): SpecChange[] {
    const changes = new Map<string, AppSpec>();
    const rewrittenOwner = rewriteFieldReferences(ownerSpec, typeKey, from, to);
    changes.set(owner.id, rewrittenOwner);
    if (owner.id !== this.context.space().id) return mapChanges(changes);

    for (const app of this.context.apps()) {
      if (app.spec.types.some((type) => type.key === typeKey)) continue;
      const composite = rewriteFieldReferences(
        specWithSharedTypes(app.spec, rewrittenOwner),
        typeKey,
        from,
        to,
      );
      changes.set(app.id, {
        ...cloneSpec(app.spec),
        views: composite.views,
        forms: composite.forms,
        workflows: composite.workflows,
        pages: composite.pages,
      });
    }
    return mapChanges(changes);
  }

  private rewriteTypeInConsumers(
    owner: SpaceState,
    ownerSpec: AppSpec,
    from: string,
    to: string,
  ): SpecChange[] {
    const changes = new Map<string, AppSpec>();
    changes.set(owner.id, rewriteTypeReferences(ownerSpec, from, to));
    if (owner.id !== this.context.space().id) return mapChanges(changes);

    for (const app of this.context.apps()) {
      if (app.spec.types.some((type) => type.key === from)) continue;
      changes.set(app.id, rewriteTypeReferences(app.spec, from, to));
    }
    return mapChanges(changes);
  }

  private assertTypeRenameAvailable(
    owner: SpaceState,
    type: TypeDef,
    from: string,
    to: string,
  ): void {
    const consumers =
      owner.id === this.context.space().id
        ? [owner, ...this.context.apps()]
        : [owner, this.context.space()];
    for (const consumer of consumers) {
      const conflict = consumer.spec.types.find(
        (candidate) => candidate.key === to && candidate.id !== type.id,
      );
      if (conflict) throw new Error(`Type key "${to}" is already used by ${conflict.label}`);
    }

    for (const app of owner.id === this.context.space().id ? this.context.apps() : [owner]) {
      const view = app.spec.views.find(
        (candidate) => candidate.key === `${to}_list` && candidate.source !== from,
      );
      if (view) throw new Error(`Type key "${to}" conflicts with view "${view.key}"`);
      const form = app.spec.forms.find(
        (candidate) =>
          (candidate.key === `${to}_create` || candidate.key === `${to}_edit`) &&
          candidate.type !== from,
      );
      if (form) throw new Error(`Type key "${to}" conflicts with form "${form.key}"`);
      const page = app.spec.pages.find((candidate) => candidate.key === `${to}_page`);
      if (page) throw new Error(`Type key "${to}" conflicts with page "${page.key}"`);
    }
  }
}

function mapChanges(changes: Map<string, AppSpec>): SpecChange[] {
  return [...changes].map(([id, spec]) => ({ id, spec }));
}

function specWithSharedTypes(app: AppSpec, space: AppSpec): AppSpec {
  const local = cloneSpec(app);
  const localKeys = new Set(local.types.map((type) => type.key));
  return {
    ...local,
    types: [
      ...local.types,
      ...cloneData(space.types.filter((type) => isExposed(type) && !localKeys.has(type.key))),
    ],
  };
}

function scopedReference(scope: SpaceState, reference: SpecReference): SpecReference {
  return {
    ...reference,
    path: `spaces.${scope.id}.${reference.path}`,
    description: `${scope.name}: ${reference.description}`,
  };
}

function uniqueReferences(references: SpecReference[]): SpecReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (seen.has(reference.path)) return false;
    seen.add(reference.path);
    return true;
  });
}

function referencedByError(
  kind: "type" | "field",
  key: string,
  references: SpecReference[],
): Error {
  const preview = references
    .slice(0, 3)
    .map((reference) => reference.description)
    .join(", ");
  const remaining = references.length > 3 ? ` and ${references.length - 3} more` : "";
  return new Error(`Cannot delete ${kind} "${key}" because it is used by ${preview}${remaining}`);
}

function folderName(value: unknown): string | undefined {
  if (value == null || value === false) return undefined;
  const text = scalarString(value).trim();
  return text || undefined;
}

function upsertNamed<T extends { key: string }>(list: T[], item: T): T[] {
  if (list.some((existing) => existing.key === item.key)) {
    return list.map((existing) =>
      existing.key === item.key ? { ...existing, ...item } : existing,
    );
  }
  return [...list, item];
}
