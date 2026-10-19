import { describe, expect, it, vi } from "vite-plus/test";
import { render } from "svelte/server";
import SetupForm from "./setup-form.svelte";

vi.mock("$lib/app/session.svelte.ts", () => ({ setup: vi.fn() }));

describe("first-run form markup", () => {
  it("offers a single accessible form with no default login or credentials", () => {
    const html = render(SetupForm).body;
    expect(html.match(/<form\b/g)).toHaveLength(1);
    for (const name of ["name", "username", "password", "confirmation", "spaceName"])
      expect(html).toContain(`name="${name}"`);
    expect(html).toContain('autocomplete="new-password"');
    expect(html).toContain('minlength="12"');
    expect(html).toContain('for="setup-password"');
    expect(html).toContain('aria-describedby="setup-password-help"');
    expect(html).toContain("Create login and get started");
    expect(html).toContain("Only continue if you are setting up this server");
    expect(html).not.toContain('value="admin"');
    expect(html).not.toContain("build/setup.mjs");
  });
});
