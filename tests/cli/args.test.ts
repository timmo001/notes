import { describe, expect, test } from "bun:test";
import {
  expectedHashOption,
  hasOption,
  optionValue,
  parseSince,
  validateOptions,
} from "../../src/cli/args.js";

const options = {
  "--all": "flag",
  "--format": "value",
} as const;

describe("validateOptions", () => {
  test("accepts known flags and values", () => {
    expect(() =>
      validateOptions(["--all", "--format=json"], options),
    ).not.toThrow();
  });

  test.each([
    [["--unknown"], "Unknown option"],
    [["value"], "Unexpected argument"],
    [["--all", "--all"], "Duplicate option"],
    [["--format"], "requires a value"],
    [["--all=true"], "does not take a value"],
  ] as const)("rejects %p", (args, message) => {
    expect(() => validateOptions(args, options)).toThrow(message);
  });

  test.each([
    [["--format="], "requires a value"],
    [["--format=json", "--format", "labels"], "Duplicate option"],
    [["--format", "--all"], "requires a value"],
  ] as const)("rejects malformed values %p", (args, message) => {
    expect(() => validateOptions(args, options)).toThrow(message);
  });

  test("validates expected hashes", () => {
    const hash = "a".repeat(64);
    expect(expectedHashOption(["--expected-hash", hash])).toBe(hash);
    expect(() => expectedHashOption(["--expected-hash", "invalid"])).toThrow(
      "lowercase SHA-256",
    );
  });
});

describe("option readers", () => {
  test("reads flags and separated or inline values", () => {
    expect(hasOption(["--all"], "--all")).toBeTrue();
    expect(optionValue(["--format", "json"], "--format")).toBe("json");
    expect(optionValue(["--format=labels"], "--format")).toBe("labels");
  });

  test("does not treat another option as a value", () => {
    expect(optionValue(["--format", "--all"], "--format")).toBeUndefined();
  });
});

describe("parseSince", () => {
  test.each([
    ["1", "1970-01-01T00:00:01.000Z"],
    ["10000000000000", "2286-11-20T17:46:40.000Z"],
    ["2026-07-10T12:00:00Z", "2026-07-10T12:00:00.000Z"],
  ])("parses %s", (input, expected) => {
    expect(parseSince(input)).toBe(expected);
  });

  test("parses relative durations", () => {
    const before = Date.now() - 2 * 86_400_000;
    const parsed = Date.parse(parseSince("2 days ago"));
    const after = Date.now() - 2 * 86_400_000;
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  test("rejects unknown values", () => {
    expect(() => parseSince("sometime recently")).toThrow(
      "Unknown --since value",
    );
  });
});
