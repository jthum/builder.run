/** Host-owned semantic keys for implicit Collection surfaces. */
export function implicitViewKey(key: string): string {
  return `${key}_list`;
}
export function implicitCreateFormKey(key: string): string {
  return `${key}_create`;
}
export function implicitEditFormKey(key: string): string {
  return `${key}_edit`;
}
export function implicitPageKey(key: string): string {
  return `${key}_page`;
}
