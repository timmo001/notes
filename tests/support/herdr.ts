import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import { herdrSdkLayerFromOptions } from "@herdr/sdk";

const Request = Schema.fromJsonString(
  Schema.Struct({
    id: Schema.String,
    method: Schema.String,
    params: Schema.Record(Schema.String, Schema.Unknown),
  }),
);

export type HerdrRequest = typeof Request.Type;

const workspace = {
  workspace_id: "w1",
  active_tab_id: "w1:t2",
  label: "notes",
  number: 1,
  pane_count: 1,
  tab_count: 1,
  agent_status: "idle",
  focused: false,
};
const tab = {
  tab_id: "w1:t2",
  workspace_id: "w1",
  label: "Agent",
  number: 2,
  pane_count: 1,
  agent_status: "idle",
  focused: false,
};
const pane = {
  pane_id: "w1:p2",
  tab_id: "w1:t2",
  workspace_id: "w1",
  terminal_id: "terminal-2",
  revision: 0,
  agent_status: "idle",
  focused: false,
};

/** Isolated protocol-22 peer used by source and compiled CLI checks. */
export async function herdrFixture(
  options: {
    readonly workspaceLabel?: string;
    readonly newWorkspace?: boolean;
    readonly detectionFailures?: number;
    readonly runtime?: string;
    readonly failMethod?: string;
    readonly protocol?: number;
    readonly focusedPaneId?: string | null;
    readonly paneCwd?: string;
    readonly foregroundCwd?: string;
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "notes-herdr-"));
  const socketPath = join(directory, "herdr.sock");
  const requests: HerdrRequest[] = [];
  const sockets = new Set<Socket>();
  let detectionFailures = options.detectionFailures ?? 0;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffered = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffered += chunk;
      let newline;
      while ((newline = buffered.indexOf("\n")) >= 0) {
        const request = Schema.decodeSync(Request)(buffered.slice(0, newline));
        buffered = buffered.slice(newline + 1);
        requests.push(request);
        const fail =
          request.method === options.failMethod ||
          (request.method === "agent.get" && detectionFailures-- > 0);
        socket.write(
          JSON.stringify(
            fail
              ? {
                  id: request.id,
                  error: {
                    code: "fixture_failure",
                    message: "Fixture failure",
                  },
                }
              : { id: request.id, result: response(request.method) },
          ) + "\n",
        );
      }
    });
  });
  function response(method: string) {
    switch (method) {
      case "ping":
        return {
          type: "pong",
          version: "0.9.0",
          protocol: options.protocol ?? 22,
        };
      case "integration.list":
        return {
          type: "integration_list",
          integrations: [
            {
              target: "cursor",
              label: "Cursor Agent",
              command: "cursor-agent",
              available: true,
              state: "current",
            },
            {
              target: "opencode",
              label: "OpenCode",
              command: "opencode",
              available: true,
              state: "current",
            },
            {
              target: "claude",
              label: "Claude Code",
              command: "claude",
              available: false,
              state: "outdated",
            },
            {
              target: "pi",
              label: "Pi",
              command: "pi",
              available: true,
              state: "current",
            },
            {
              target: "codex",
              label: "Codex",
              command: "codex",
              available: true,
              state: "not_installed",
            },
          ],
        };
      case "session.snapshot":
        return {
          type: "session_snapshot",
          snapshot: {
            version: "0.9.0",
            protocol: 22,
            focused_workspace_id: workspace.workspace_id,
            focused_tab_id: tab.tab_id,
            focused_pane_id:
              options.focusedPaneId === undefined
                ? pane.pane_id
                : options.focusedPaneId,
            workspaces: [workspace],
            tabs: [tab],
            panes: [
              {
                ...pane,
                cwd: options.paneCwd,
                foreground_cwd: options.foregroundCwd,
              },
            ],
            layouts: [],
            agents: [],
          },
        };
      case "workspace.list":
        return {
          type: "workspace_list",
          workspaces: options.newWorkspace
            ? []
            : [{ ...workspace, label: options.workspaceLabel ?? "notes" }],
        };
      case "workspace.create":
        return { type: "workspace_created", workspace, tab, root_pane: pane };
      case "workspace.focus":
        return { type: "workspace_info", workspace };
      case "tab.create":
        return { type: "tab_created", tab, root_pane: pane };
      case "tab.rename":
      case "tab.focus":
        return { type: "tab_info", tab };
      case "pane.send_input":
        return { type: "ok" };
      case "agent.get":
      case "agent.wait":
        return {
          type: "agent_info",
          agent: { ...pane, interactive_ready: true },
        };
      case "agent.prompt":
        return {
          type: "agent_prompted",
          agent: { ...pane, interactive_ready: true },
        };
      case "pane.process_info":
        return {
          type: "pane_process_info",
          process_info: {
            pane_id: pane.pane_id,
            foreground_processes: [
              {
                pid: 123,
                name: "opencode",
                argv: [options.runtime ?? "/opt/opencode2"],
              },
            ],
          },
        };
      default:
        throw new Error(`Unexpected Herdr method: ${method}`);
    }
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return {
    socketPath,
    requests,
    layer: herdrSdkLayerFromOptions({ socketPath }),
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
