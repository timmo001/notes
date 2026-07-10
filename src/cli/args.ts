/** Return whether an option flag is present. */
export function hasOption(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

/** Return an option value from `--flag value` or `--flag=value`. */
export function optionValue(
  args: readonly string[],
  name: string,
): string | undefined {
  const equals = args.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

/** Reject unknown, duplicate, valueless, or positional command arguments. */
export function validateOptions(
  args: readonly string[],
  options: Readonly<Record<string, "flag" | "value">>,
): void {
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const equalsIndex = arg.indexOf("=");
    const name = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    const kind = options[name];
    if (!kind) throw new Error(`Unknown option: ${name}`);
    if (seen.has(name)) throw new Error(`Duplicate option: ${name}`);
    seen.add(name);
    if (kind === "flag" && equalsIndex !== -1) {
      throw new Error(`Option ${name} does not take a value`);
    }
    if (kind === "value") {
      const value =
        equalsIndex === -1 ? args[index + 1] : arg.slice(equalsIndex + 1);
      if (!value || value.startsWith("-")) {
        throw new Error(`Option ${name} requires a value`);
      }
      if (equalsIndex === -1) index += 1;
    }
  }
}

/** Validate an optional lowercase SHA-256 command value. */
export function expectedHashOption(
  args: readonly string[],
): string | undefined {
  const value = optionValue(args, "--expected-hash");
  if (value !== undefined && !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("--expected-hash must be a lowercase SHA-256 hash");
  }
  return value;
}

/** Parse ISO/RFC/epoch/relative date values to ISO strings. */
export function parseSince(value: string): string {
  const trimmed = value.trim();
  const timestamp = parseSinceTimestamp(trimmed);
  if (!Number.isFinite(timestamp)) {
    throw new Error(
      `Unknown --since value: ${value} (expected an ISO/RFC date, epoch timestamp, or relative duration like 2d / 2 days ago)`,
    );
  }
  return new Date(timestamp).toISOString();
}

function parseSinceTimestamp(value: string): number {
  if (/^\d+$/.test(value)) return normalizeEpoch(Number(value));
  return parseRelativeSinceTimestamp(value) ?? Date.parse(value);
}

function parseRelativeSinceTimestamp(value: string): number | undefined {
  const match = value
    .toLowerCase()
    .match(
      /^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)(?:\s+ago)?$/,
    );
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const millis = relativeUnitMillis(match[2]);
  return millis === undefined ? undefined : Date.now() - amount * millis;
}

function relativeUnitMillis(unit: string | undefined): number | undefined {
  switch (unit) {
    case "s":
    case "sec":
    case "secs":
    case "second":
    case "seconds":
      return 1_000;
    case "m":
    case "min":
    case "mins":
    case "minute":
    case "minutes":
      return 60_000;
    case "h":
    case "hr":
    case "hrs":
    case "hour":
    case "hours":
      return 3_600_000;
    case "d":
    case "day":
    case "days":
      return 86_400_000;
    case "w":
    case "week":
    case "weeks":
      return 604_800_000;
    default:
      return undefined;
  }
}

function normalizeEpoch(epoch: number): number {
  return epoch < 10_000_000_000 ? epoch * 1000 : epoch;
}
