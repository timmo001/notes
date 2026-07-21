import {
  collectSpeechResult,
  createSpeechRecognition,
  speechRecognitionConstructor,
} from "./speech.js";

const form = document.querySelector<HTMLFormElement>("[data-capture-form]");
const textarea = document.querySelector<HTMLTextAreaElement>("#capture");
const title = document.querySelector<HTMLInputElement>("#title");
const record = document.querySelector<HTMLButtonElement>("[data-record]");
const recordLabel = document.querySelector<HTMLElement>("[data-record-label]");
const status = document.querySelector<HTMLElement>("[data-status]");

if (!form || !textarea || !title || !record || !recordLabel || !status) {
  throw new Error("Capture form is incomplete");
}

let source: "text" | "speech" = "text";
let listening = false;
let transcriptBeforeRecording = "";
const Constructor = speechRecognitionConstructor();

if (Constructor) {
  record.hidden = false;
  const recognition = createSpeechRecognition(Constructor);

  recognition.onresult = (event) => {
    const result = collectSpeechResult(event);
    const parts = [
      transcriptBeforeRecording,
      result.finalText,
      result.interimText,
    ]
      .filter(Boolean)
      .join(" ");
    textarea.value = parts;
    source = "speech";
  };
  recognition.onend = () => {
    listening = false;
    record.classList.remove("is-recording");
    recordLabel.textContent = "Dictate";
    status.textContent =
      "Dictation stopped. Edit the transcript before sending.";
  };
  recognition.onerror = () => {
    status.textContent = "Dictation was unavailable. You can keep typing.";
  };

  record.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    transcriptBeforeRecording = textarea.value.trim();
    listening = true;
    record.classList.add("is-recording");
    recordLabel.textContent = "Stop";
    status.textContent = "Listening...";
    recognition.start();
  });
}

textarea.addEventListener("input", () => {
  if (!listening) source = "text";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector<HTMLButtonElement>("[type=submit]");
  if (!submit || !textarea.value.trim()) return;

  submit.disabled = true;
  status.textContent = "Sending to the private queue...";
  try {
    const response = await fetch("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        requestId: crypto.randomUUID(),
        text: textarea.value,
        titleHint: title.value.trim() || undefined,
        capturedAt: new Date().toISOString(),
        source,
      }),
    });
    const result: unknown = await response.json();
    if (
      !response.ok ||
      typeof result !== "object" ||
      result === null ||
      !("url" in result) ||
      typeof result.url !== "string"
    ) {
      throw new Error("Capture request failed");
    }
    form.reset();
    status.innerHTML = `Queued as <a href="${result.url}">a private issue</a>.`;
  } catch {
    status.textContent =
      "Could not queue this capture. Your text is still here.";
  } finally {
    submit.disabled = false;
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js");
  });
}
