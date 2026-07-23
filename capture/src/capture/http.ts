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

const captureErrors: readonly CaptureError[] = Object.values(CAPTURE_ERRORS);

function isCaptureError(value: string): value is CaptureError {
  return captureErrors.some((error) => error === value);
}

export function decodeCaptureError(value: unknown): CaptureError | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("error" in value) ||
    typeof value.error !== "string" ||
    !isCaptureError(value.error)
  ) {
    return undefined;
  }
  return value.error;
}

export function captureErrorMessage(value: unknown): string {
  const error = decodeCaptureError(value);
  return error ? `${error}. Your text is still here.` : GENERIC_CAPTURE_ERROR;
}
