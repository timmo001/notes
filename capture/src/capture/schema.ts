import { Schema } from "effect";

const NonEmptyText = Schema.Trimmed.check(Schema.isNonEmpty()).check(
  Schema.isMaxLength(12_000),
);

export const CaptureInput = Schema.Struct({
  version: Schema.Literal(1),
  requestId: Schema.String.check(Schema.isUUID()),
  text: NonEmptyText,
  titleHint: Schema.optional(
    Schema.Trimmed.check(Schema.isNonEmpty()).check(Schema.isMaxLength(120)),
  ),
  capturedAt: Schema.DateTimeUtcFromString,
  source: Schema.Literals(["text", "speech"]),
});

export type Capture = typeof CaptureInput.Type;

export const decodeCapture = Schema.decodeUnknownSync(CaptureInput);
