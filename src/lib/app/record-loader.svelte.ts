import { loadRecordDetails, type RecordReference } from "./record-details.ts";

/** Ignore late results when selection, Workspace or the owning component changes. */
export class RecordLoader {
  record = $state<Record<string, unknown> | null>(null);
  references = $state<Record<string, RecordReference>>({});
  loading = $state(false);
  error = $state<string | null>(null);
  private version = 0;

  async load(...args: Parameters<typeof loadRecordDetails>) {
    const version = ++this.version;
    this.record = null;
    this.references = {};
    this.error = null;
    this.loading = true;
    try {
      const result = await loadRecordDetails(...args);
      if (version !== this.version) return;
      this.record = result.record;
      this.references = result.references;
    } catch {
      if (version === this.version) this.error = "Couldn't load this record. Please try again.";
    } finally {
      if (version === this.version) this.loading = false;
    }
  }

  cancel() {
    this.version++;
  }
}
