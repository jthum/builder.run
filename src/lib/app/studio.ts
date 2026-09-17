export const studioItems = [
  {
    href: "/build/types",
    label: "Data",
    description: "The kinds of records this app keeps — name them, then add fields.",
    group: "Build",
  },
  {
    href: "/build/views",
    label: "Views",
    description: "Saved lists with filters, like unpaid invoices or active projects.",
    group: "Build",
  },
  {
    href: "/build/forms",
    label: "Forms",
    description: "Screens for adding and editing. Each record type already has a pair.",
    group: "Build",
  },
  {
    href: "/build/pages",
    label: "Pages",
    description:
      "The main screens under Home. Group them into folders, or delete ones you don’t need.",
    group: "Build",
  },
  {
    href: "/build/automations",
    label: "Automations",
    description: "Buttons people tap, and automations that run when something changes.",
    group: "Behaviour",
  },
  {
    href: "/library/blocks",
    label: "Blocks",
    description: "Browse the visual building blocks available for pages.",
    group: "Library",
  },
  {
    href: "/build/actors",
    label: "People",
    description: "Who can use this space.",
    group: "Space",
  },
  {
    href: "/build/settings",
    label: "App settings",
    description: "Rename this app and manage its preferences.",
    group: "Space",
  },
  {
    href: "/build/spec",
    label: "Export",
    description: "Download or paste the app definition.",
    group: "Space",
  },
  {
    href: "/diagnostics",
    label: "Inspect",
    description: "Storage and what this browser can do.",
    group: "Space",
  },
] as const;

export const studioGroupOrder = ["Build", "Behaviour", "Library", "Space"] as const;
