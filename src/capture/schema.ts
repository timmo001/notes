import { Schema } from "effect";

const NonEmptyText = Schema.Trim.check(Schema.isNonEmpty()).check(
  Schema.isMaxLength(12_000),
);

/** Versioned captured-note input shared by local and web submission paths. */
export const CaptureInput = Schema.Struct({
  version: Schema.Literal(1),
  requestId: Schema.String.check(Schema.isUUID()),
  text: NonEmptyText,
  titleHint: Schema.optional(
    Schema.Trimmed.check(Schema.isNonEmpty()).check(Schema.isMaxLength(120)),
  ),
  capturedAt: Schema.DateTimeUtcFromString,
  source: Schema.Literal("text"),
  repository: Schema.optional(
    Schema.String.check(Schema.isPattern(/^[^/\s]+\/[^/\s]+$/)),
  ),
});

/** A validated captured-note request. */
export type Capture = typeof CaptureInput.Type;

/** Decode untrusted input as a captured-note request. */
export const decodeCapture = Schema.decodeUnknownSync(CaptureInput);
