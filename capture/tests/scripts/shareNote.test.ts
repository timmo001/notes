import { describe, expect, test } from "bun:test";
import { shareNote } from "../../src/scripts/shareNote.js";

describe("shareNote", () => {
  test("puts the title, text and link on their own lines", () => {
    expect(
      shareNote({
        title: "A post",
        text: "Worth reading",
        url: "https://example.com/post",
      }),
    ).toBe("A post\nWorth reading\nhttps://example.com/post");
  });

  test("leaves out a link the text already holds", () => {
    expect(
      shareNote({
        text: "Worth reading https://example.com/post",
        url: "https://example.com/post",
      }),
    ).toBe("Worth reading https://example.com/post");
  });

  test("leaves out blanks and repeats", () => {
    expect(shareNote({ title: " ", text: "Same", url: "Same" })).toBe("Same");
    expect(shareNote({})).toBe("");
  });
});
