import { Option, Schema } from "effect";

export const CAPTURE_ERRORS = {
  expectedJson: "Expected application/json",
  tooLarge: "Capture is too large",
  invalidCapture: "Invalid capture",
  invalidConfiguration: "Capture is not configured correctly",
  invalidRepository: "Invalid capture repository",
  queueFailed: "The capture could not be queued",
} as const;

export type CaptureError = (typeof CAPTURE_ERRORS)[keyof typeof CAPTURE_ERRORS];

export const GENERIC_CAPTURE_ERROR =
  "Could not queue this capture. Your text is still here.";

const CaptureErrorResponse = Schema.Struct({
  error: Schema.Literals(Object.values(CAPTURE_ERRORS)),
});
const decodeCaptureErrorOption =
  Schema.decodeUnknownOption(CaptureErrorResponse);

export const decodeCaptureError = <Input>(value: Input) =>
  Option.getOrUndefined(decodeCaptureErrorOption(value))?.error;

export function captureErrorMessage<Input>(value: Input): string {
  const error = decodeCaptureError(value);
  return error ? `${error}. Your text is still here.` : GENERIC_CAPTURE_ERROR;
}
