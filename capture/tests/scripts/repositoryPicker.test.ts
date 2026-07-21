import { describe, expect, test } from "bun:test";
import {
  filterRepositories,
  restoreRepository,
} from "../../src/scripts/repositoryPicker.js";

const options = [
  { repository: "owner/notes", searchText: "Personal notes owner/notes" },
  { repository: "owner/app", searchText: "Application owner/app" },
];

describe("filterRepositories", () => {
  test("matches labels and repository identifiers without case sensitivity", () => {
    expect(filterRepositories(options, "PERSONAL")).toEqual(["owner/notes"]);
    expect(filterRepositories(options, "owner/app")).toEqual(["owner/app"]);
  });

  test("returns every repository for an empty query", () => {
    expect(filterRepositories(options, "  ")).toHaveLength(2);
  });
});

describe("restoreRepository", () => {
  test("restores only an allowed stored repository", () => {
    const allowed = options.map(({ repository }) => repository);
    expect(restoreRepository("owner/app", allowed, "owner/notes")).toBe(
      "owner/app",
    );
    expect(restoreRepository("owner/old", allowed, "owner/notes")).toBe(
      "owner/notes",
    );
  });
});
