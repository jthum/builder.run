import type { SourceQueryDefinition } from "@jthum/framework/spec";

/** Same structural signature as the build-time compiler; values and direction are runtime input. */
export function queryShape(query: SourceQueryDefinition): string | undefined {
  if (query.aggregate || (query.sort?.length ?? 0) > 1) return undefined;
  const filter = query.filter;
  if (
    filter &&
    (!("path" in filter) ||
      filter.path.length !== 1 ||
      !["eq", "gt", "gte", "lt", "lte"].includes(filter.operator))
  )
    return undefined;
  if (query.sort?.some((sort) => sort.path.length !== 1)) return undefined;
  return JSON.stringify([
    filter && "path" in filter ? [filter.path[0], filter.operator] : null,
    query.sort?.[0]?.path[0] ?? null,
  ]);
}
