import type { ZeroDatabase, ZeroReadDatabase, ZeroTable } from "./model.ts";

export class ZeroRollbackRequired extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

/** Native write failures must abort the parent even if a higher layer formats/catches the error. */
export class ZeroRequestTransaction {
  private failed = false;
  private failure: unknown;
  readonly db: ZeroDatabase;
  constructor(db: ZeroReadDatabase) {
    this.db = Object.fromEntries(
      Object.entries(db).map(([name, table]) => {
        if (!("insert" in table)) return [name, table];
        const writer = table as ZeroTable;
        const guard = async <T>(work: () => Promise<T>) => {
          this.assertHealthy();
          try {
            return await work();
          } catch (error) {
            this.failed = true;
            this.failure = error;
            throw error;
          }
        };
        return [
          name,
          {
            withIndex: writer.withIndex.bind(writer),
            insert: (value: object) => guard(() => writer.insert(value)),
            update: (id: string, value: object) => guard(() => writer.update(id, value)),
            delete: (id: string) => guard(() => writer.delete(id)),
          },
        ];
      }),
    ) as ZeroDatabase;
  }
  assertHealthy(): void {
    if (this.failed) throw this.failure;
  }
  abort(cause: unknown): never {
    throw new ZeroRollbackRequired(cause);
  }
}
