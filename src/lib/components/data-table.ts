export type DataTableColumn = {
  id: string;
  label: string;
  accessor?: (row: Record<string, unknown>) => unknown;
  sortable?: boolean;
  numeric?: boolean;
  filterValues?: string[];
  href?: (row: Record<string, unknown>) => string | undefined;
};

export function cellValue(row: Record<string, unknown>, column: DataTableColumn): unknown {
  return column.accessor ? column.accessor(row) : row[column.id];
}

export function rowId(row: Record<string, unknown>): string {
  return String(row.id ?? "");
}

export function compareRows(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  column: DataTableColumn,
  direction: "asc" | "desc",
): number {
  const a = cellValue(left, column);
  const b = cellValue(right, column);
  if (a == null || a === "") return 1;
  if (b == null || b === "") return -1;
  const numeric =
    column.numeric ||
    typeof a === "number" ||
    (typeof a === "string" && a !== "" && !Number.isNaN(Number(a)) && typeof b === "number");
  let result = 0;
  if (numeric || (typeof a === "number" && typeof b === "number")) {
    result = Number(a) - Number(b);
  } else {
    result = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }
  return direction === "asc" ? result : -result;
}
