import { describe, expect, test } from "bun:test";
import {
  parseRepositoryOptions,
  resolveRepository,
  splitRepository,
} from "../../src/capture/repositories.js";

const defaultRepository = "owner/notes";

describe("parseRepositoryOptions", () => {
  test("returns undefined when the picker is not configured", () => {
    expect(parseRepositoryOptions(undefined)).toBeUndefined();
    expect(parseRepositoryOptions("[]")).toBeUndefined();
  });

  test("decodes configured repositories", () => {
    expect(
      parseRepositoryOptions(
        JSON.stringify([
          { label: "Notes", repository: defaultRepository },
          { label: "Application", repository: "owner/application" },
        ]),
      ),
    ).toHaveLength(2);
  });

  test("rejects duplicates", () => {
    expect(() =>
      parseRepositoryOptions(
        JSON.stringify([
          { label: "Notes", repository: defaultRepository },
          { label: "Duplicate", repository: defaultRepository },
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

describe("resolveRepository", () => {
  const options = [
    { label: "Notes", repository: defaultRepository },
    { label: "Application", repository: "owner/application" },
  ];

  test("uses the default when no repository is selected", () => {
    expect(resolveRepository(undefined, defaultRepository, options)).toBe(
      defaultRepository,
    );
  });

  test("allows configured repositories and rejects unknown repositories", () => {
    expect(
      resolveRepository("owner/application", defaultRepository, options),
    ).toBe("owner/application");
    expect(() =>
      resolveRepository("owner/unknown", defaultRepository, options),
    ).toThrow("not allowed");
  });
});
