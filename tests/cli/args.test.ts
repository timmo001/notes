import { describe, expect, test } from "bun:test";
import { expectedHashOption, validateOptions } from "../../src/cli/args.js";

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

  test("validates expected hashes", () => {
    const hash = "a".repeat(64);
    expect(expectedHashOption(["--expected-hash", hash])).toBe(hash);
    expect(() => expectedHashOption(["--expected-hash", "invalid"])).toThrow(
      "lowercase SHA-256",
    );
  });
});
