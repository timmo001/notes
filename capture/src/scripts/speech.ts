export interface SpeechResult {
  readonly finalText: string;
  readonly interimText: string;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: {
      readonly isFinal: boolean;
      readonly 0: { readonly transcript: string };
    };
  };
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechWindow extends Window {
  readonly SpeechRecognition?: SpeechRecognitionConstructor;
  readonly webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export function speechRecognitionConstructor(
  target: SpeechWindow = window,
): SpeechRecognitionConstructor | undefined {
  return target.SpeechRecognition ?? target.webkitSpeechRecognition;
}

export function collectSpeechResult(
  event: SpeechRecognitionEventLike,
): SpeechResult {
  let finalText = "";
  let interimText = "";
  for (let index = 0; index < event.results.length; index++) {
    const result = event.results[index];
    if (!result) continue;
    if (result.isFinal) finalText += result[0].transcript;
    else interimText += result[0].transcript;
  }
  return { finalText: finalText.trim(), interimText: interimText.trim() };
}

export function createSpeechRecognition(
  Constructor: SpeechRecognitionConstructor,
): SpeechRecognitionLike {
  const recognition = new Constructor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-GB";
  return recognition;
}
