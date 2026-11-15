import { docsConfig } from "@timmo001/docs-kit/blume";
import { defineConfig } from "blume";

export default defineConfig(
  docsConfig({
    title: "Notes",
    description:
      "Standalone CLI and MCP server for repo-scoped Markdown notes.",
    site: "notes.timmo.dev",
    github: { owner: "timmo001", repo: "notes" },
    redirects: [{ from: "/mcp/tools", to: "/mcp-server/tools" }],
    navigation: {
      sidebar: [
        "/",
        "/install",
        "/quick-start",
        {
          label: "CLI",
          root: "/cli",
          items: ["/cli/commands", "/cli/completions"],
        },
        {
          label: "Notes",
          root: "/notes",
          items: ["/notes/handoffs"],
        },
        {
          label: "MCP",
          root: "/mcp-server",
          items: ["/mcp-server/tools"],
        },
        {
          label: "Integrations",
          items: [
            "/integrations/opencode",
            "/integrations/capture-daemon",
            "/integrations/omarchy-capture",
            "/integrations/web-capture",
          ],
        },
      ],
    },
  }),
);
