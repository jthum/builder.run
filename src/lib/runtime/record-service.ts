import type { AppSpec, ExecutionContext, RecordValue, ViewDef } from "./model.ts";
import { cloneData } from "./model.ts";
import { executeView, findType, type QueryContext, type ViewRunContext } from "./query.ts";
import {
  createRecord,
  decodeRecord,
  deleteRecord,
  prepareFieldValues,
  updateRecord,
  validateFields,
  type ChangeEvent,
} from "./records.ts";
import { scalarString } from "./values.ts";
import {
  invokeWorkflow,
  matchingEventTriggers,
  matchingTriggers,
  type WorkflowRun,
} from "./workflows.ts";

export type { WorkflowRun } from "./workflows.ts";

export interface RecordServiceContext {
  resolvedSpec(): AppSpec;
  queryContext(): QueryContext;
  executionContext(): ExecutionContext;
  publish(): Promise<void>;
}

/**
 * Runs application data operations and their resulting workflow cascade through
 * one path, regardless of whether the caller is UI, WebMCP, or another adapter.
 */
export class RecordService {
  constructor(private readonly context: RecordServiceContext) {}

  async list(typeKey: string): Promise<RecordValue[]> {
    const context = this.context.queryContext();
    const type = findType(context, typeKey);
    if (!type) return [];
    const rows = await context.engineFor(type).select(type.key, {
      orderBy: { updated_at: "desc" },
    });
    return rows.map((row) => decodeRecord(type, row));
  }

  async get(typeKey: string, id: string): Promise<RecordValue | null> {
    const context = this.context.queryContext();
    const type = findType(context, typeKey);
    if (!type) return null;
    const row = await context.engineFor(type).get(type.key, id);
    return row ? decodeRecord(type, row) : null;
  }

  async create(typeKey: string, values: Record<string, unknown>): Promise<RecordValue> {
    const result = await createRecord(
      this.context.queryContext(),
      typeKey,
      cloneData(values),
      this.context.executionContext(),
    );
    await this.afterChanges([result.change]);
    return result.record;
  }

  async update(typeKey: string, id: string, values: Record<string, unknown>): Promise<RecordValue> {
    const result = await updateRecord(
      this.context.queryContext(),
      typeKey,
      id,
      cloneData(values),
      this.context.executionContext(),
    );
    await this.afterChanges([result.change]);
    return result.record;
  }

  async transition(typeKey: string, id: string, transitionKey: string): Promise<RecordValue> {
    const type = findType(this.context.queryContext(), typeKey);
    if (!type?.lifecycle) throw new Error(`${type?.label ?? typeKey} does not define a lifecycle`);
    const record = await this.get(typeKey, id);
    if (!record) throw new Error(`${type.label} ${id} not found`);
    const current = scalarString(record[type.lifecycle.field]);
    const transition = type.lifecycle.transitions.find(
      (item) => item.key === transitionKey && item.from.includes(current),
    );
    if (!transition)
      throw new Error(`Transition ${transitionKey} is not available from ${current}`);
    return this.update(typeKey, id, { [type.lifecycle.field]: transition.to });
  }

  async remove(typeKey: string, id: string): Promise<void> {
    const result = await deleteRecord(this.context.queryContext(), typeKey, id);
    await this.afterChanges([result.change]);
  }

  async query(
    view: string | ViewDef,
    expose?: Record<string, unknown>,
    context?: ViewRunContext,
  ): Promise<Array<Record<string, unknown>>> {
    const resolved =
      typeof view === "string"
        ? this.context.resolvedSpec().views.find((item) => item.key === view)
        : view;
    if (!resolved) return [];
    return executeView(
      this.context.queryContext(),
      typeof view === "string" ? resolved : cloneData(resolved),
      expose ? cloneData(expose) : expose,
      context ? cloneData(context) : context,
    );
  }

  async invoke(workflowKey: string, input: Record<string, unknown> = {}): Promise<WorkflowRun> {
    const spec = this.context.resolvedSpec();
    const workflow = spec.workflows.find((item) => item.key === workflowKey);
    if (!workflow) throw new Error(`Unknown workflow ${workflowKey}`);
    const run = await invokeWorkflow(
      this.context.queryContext(),
      workflow,
      cloneData(input),
      this.context.executionContext(),
      {
        getWorkflow: (key) => spec.workflows.find((item) => item.key === key),
        guard: new Set(),
      },
    );
    await this.afterChanges(run.changes);
    return run;
  }

  async submitForm(
    formKey: string,
    values: Record<string, unknown>,
    recordId?: string,
  ): Promise<RecordValue | null> {
    const spec = this.context.resolvedSpec();
    const form = spec.forms.find((item) => item.key === formKey);
    if (!form) throw new Error(`Unknown form ${formKey}`);
    let record: RecordValue | null = null;
    let submitted = cloneData(values);
    if (form.mode === "standalone") {
      if (recordId) throw new Error(`${form.label} is not attached to a record`);
      submitted = prepareFieldValues(form.inputs ?? [], submitted);
      const errors = validateFields(form.inputs ?? [], submitted);
      if (errors.length) throw new Error(errors.join("; "));
    } else {
      if (!form.type) throw new Error(`${form.label} needs a record type`);
      if (recordId) record = await this.update(form.type, recordId, submitted);
      else record = await this.create(form.type, submitted);
      submitted = Object.fromEntries(
        (form.fields ?? [])
          .filter((field) => record && Object.hasOwn(record, field))
          .map((field) => [field, record?.[field]]),
      );
    }
    await this.afterEvent("form.submitted", {
      form: form.key,
      values: submitted,
      ...(record ? { record } : {}),
    });
    return record;
  }

  private async afterChanges(changes: ChangeEvent[]): Promise<void> {
    const spec = this.context.resolvedSpec();
    const query = this.context.queryContext();
    const guard = new Set<string>();
    const queue = [...changes];
    while (queue.length) {
      const change = queue.shift() as ChangeEvent;
      for (const workflow of matchingTriggers(spec.workflows, change)) {
        const token = `${workflow.key}:${change.id}`;
        if (guard.has(token)) continue;
        guard.add(token);
        const input: Record<string, unknown> = {
          [change.type]: change.after ?? change.before ?? change.id,
          id: change.id,
          ...(change.transition ? { transition: change.transition } : {}),
        };
        const run = await invokeWorkflow(query, workflow, input, this.context.executionContext(), {
          getWorkflow: (key) => spec.workflows.find((item) => item.key === key),
          guard,
        });
        queue.push(...run.changes);
      }
    }
    await this.context.publish();
  }

  private async afterEvent(key: string, payload: Record<string, unknown>): Promise<void> {
    const spec = this.context.resolvedSpec();
    for (const workflow of matchingEventTriggers(spec.workflows, key, payload)) {
      const run = await invokeWorkflow(
        this.context.queryContext(),
        workflow,
        cloneData(payload),
        this.context.executionContext(),
        { getWorkflow: (workflowKey) => spec.workflows.find((item) => item.key === workflowKey) },
      );
      await this.afterChanges(run.changes);
    }
  }
}
