import { describe, expect, test } from "bun:test";
import { collectSpeechResult } from "../../src/scripts/speech.js";

describe("collectSpeechResult", () => {
  test("separates final and interim transcripts", () => {
    const result = collectSpeechResult({
      resultIndex: 0,
      results: {
        length: 2,
        0: { isFinal: true, 0: { transcript: "finished" } },
        1: { isFinal: false, 0: { transcript: "working" } },
      },
    } as never);

    expect(result).toEqual({
      finalText: "finished",
      interimText: "working",
    });
  });
});
