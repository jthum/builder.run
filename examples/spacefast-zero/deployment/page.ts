import { FrameworkError, ERROR_CODES } from "@jthum/framework/errors";
import type { ZeroQuery, ZeroRow } from "./model.ts";

/** Advance native keyset cursors rather than relying on take(), which clamps to 1000 rows. */
export async function readPage(
  query: () => ZeroQuery,
  limit: number,
  offset = 0,
): Promise<ZeroRow[]> {
  if (limit === 0) return [];
  const result: ZeroRow[] = [];
  let cursor: string | null = null;
  let skip = offset;
  do {
    const size = Math.min(1000, skip > 0 ? skip : limit - result.length);
    const response = await query().paginate({ cursor, numItems: size });
    if (skip > 0) skip -= response.page.length;
    else result.push(...response.page);
    if (response.isDone || result.length >= limit) break;
    cursor = response.continueCursor;
  } while (cursor !== null);
  return result;
}

/** Unpaged ports still have an explicit target budget, never an SDK-clamped partial result. */
export async function readAll(query: () => ZeroQuery, limit = 10000): Promise<ZeroRow[]> {
  const rows = await readPage(query, limit + 1);
  if (rows.length > limit)
    throw new FrameworkError({
      code: ERROR_CODES.persistenceUnsupported,
      message: `This target read exceeds its ${limit}-row budget. Use a narrower query or pagination.`,
    });
  return rows;
}
