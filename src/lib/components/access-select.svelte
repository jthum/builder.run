<script lang="ts">
  import { PERMISSIONS, type Permission } from "@jthum/framework/kernel";
  import { ACCESS_PRESETS, accessPreset } from "$lib/app/access.ts";
  import { OptionSelect } from "@jthum/framework/svelte/ui/option-select";
  import { Checkbox } from "@jthum/framework/svelte/ui/checkbox";
  import * as Field from "@jthum/framework/svelte/ui/field";

  let { permissions = $bindable<readonly Permission[]>([]), label, description, disabled = false }:
    { permissions?: readonly Permission[]; label: string; description?: string; disabled?: boolean } = $props();
  const id = $props.id();
  let custom = $state(false);
  const selected = $derived(custom ? "custom" : accessPreset(permissions));
  const options = [...ACCESS_PRESETS.map(({ value, label }) => ({ value, label })), { value: "custom", label: "Custom permissions" }];
  const labels: Record<Permission, string> = { read: "Read", create: "Create records", update: "Update records", delete: "Delete records", manage: "Manage definitions and access" };

  function select(value: string) {
    custom = value === "custom";
    const preset = ACCESS_PRESETS.find((item) => item.value === value);
    if (preset) permissions = [...preset.permissions];
  }

  function toggle(permission: Permission, checked: boolean) {
    if (permission === "read" && !checked) { permissions = []; return; }
    const next = new Set(permissions);
    if (checked) { next.add(permission); next.add("read"); } else next.delete(permission);
    permissions = PERMISSIONS.filter((item) => next.has(item));
  }
</script>

<Field.Field data-disabled={disabled}>
  <Field.Label for={id}>{label}</Field.Label>
  <OptionSelect {id} value={selected} {options} {disabled} onValueChange={select} />
  {#if description}<Field.Description>{description}</Field.Description>{/if}
  {#if selected === "custom"}
    <Field.Set>
      <Field.Legend variant="label" class="sr-only">{label} permissions</Field.Legend>
      <Field.Group class="gap-3">
        {#each PERMISSIONS as permission (permission)}
          <Field.Field orientation="horizontal" data-disabled={disabled}>
            <Checkbox id={`${id}-${permission}`} checked={permissions.includes(permission)} {disabled} onCheckedChange={(checked) => toggle(permission, checked === true)} />
            <Field.Label for={`${id}-${permission}`}>{labels[permission]}</Field.Label>
          </Field.Field>
        {/each}
      </Field.Group>
    </Field.Set>
  {/if}
</Field.Field>
