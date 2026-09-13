import { error } from "@sveltejs/kit";

export function load(): void {
  if (!import.meta.env.DEV) error(404, "Not found");
}
