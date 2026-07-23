import { describe, expect, test } from "bun:test";
import {
  parseRepositoryOptions,
  splitRepository,
  validateTargetRepository,
} from "../../src/capture/repositories.js";

describe("parseRepositoryOptions", () => {
  test("returns undefined when the picker is not configured", () => {
    expect(parseRepositoryOptions(undefined)).toBeUndefined();
    expect(parseRepositoryOptions("[]")).toBeUndefined();
  });

  test("decodes configured repositories", () => {
    expect(
      parseRepositoryOptions(
        JSON.stringify([
          { label: "Notes", repository: "owner/notes" },
          { label: "Application", repository: "owner/application" },
        ]),
      ),
    ).toHaveLength(2);
  });

  test("rejects duplicates", () => {
    expect(() =>
      parseRepositoryOptions(
        JSON.stringify([
          { label: "Notes", repository: "owner/notes" },
          { label: "Duplicate", repository: "owner/notes" },
        ]),
      ),
    ).toThrow("duplicates");
  });
});

describe("splitRepository", () => {
  test("splits a validated repository identifier", () => {
    expect(splitRepository("owner/repository")).toEqual([
      "owner",
      "repository",
    ]);
  });
});

describe("validateTargetRepository", () => {
  const options = [
    { label: "Notes", repository: "owner/notes" },
    { label: "Application", repository: "owner/application" },
  ];

  test("leaves the target unset when no repository is selected", () => {
    expect(() => validateTargetRepository(undefined, options)).not.toThrow();
  });

  test("allows configured repositories and rejects unknown repositories", () => {
    expect(() =>
      validateTargetRepository("owner/application", options),
    ).not.toThrow();
    expect(() => validateTargetRepository("owner/unknown", options)).toThrow(
      "not allowed",
    );
  });
});
