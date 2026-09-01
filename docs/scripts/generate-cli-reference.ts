import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Effect } from "effect";
import { renderHelp } from "../../src/cli/help.ts";
import { notesCommand } from "../../src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "src/content/docs/cli/commands.md");
const commands = notesCommand.subcommands.flatMap((group) => group.commands);
const lines = [
  "---",
  "title: Command Reference",
  "description: Every notes command and flag, generated from the Effect command tree.",
  "sidebar:",
  "  order: 2",
  "---",
  "",
  "<!-- Generated from the Effect command tree by `mise run docs:gen:cli`. Do not edit by hand. -->",
  "",
  "This page is generated from the same `Command` values that parse and run the CLI.",
  "",
];

for (const command of commands) {
  lines.push(
    `## \`notes ${command.name}\``,
    "",
    "```text",
    await Effect.runPromise(renderHelp(command.name)),
    "```",
    "",
  );
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, `${lines.join("\n").trimEnd()}\n`);
console.log(`Wrote ${path.relative(root, outFile)}`);
