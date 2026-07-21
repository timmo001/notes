import {
  collectSpeechResult,
  createSpeechRecognition,
  speechRecognitionConstructor,
} from "./speech.js";

const form = document.querySelector<HTMLFormElement>("[data-capture-form]");
const textarea = document.querySelector<HTMLTextAreaElement>("#capture");
const record = document.querySelector<HTMLButtonElement>("[data-record]");
const status = document.querySelector<HTMLElement>("[data-status]");

if (!form || !textarea || !record || !status) {
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
    record.setAttribute("aria-label", "Start dictation");
    record.title = "Start dictation";
    status.textContent = "";
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
    record.setAttribute("aria-label", "Stop dictation");
    record.title = "Stop dictation";
    status.textContent = "Listening";
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
  status.textContent = "Adding note...";
  try {
    const response = await fetch("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        requestId: crypto.randomUUID(),
        text: textarea.value,
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
    status.innerHTML = `<a href="${result.url}">Note added</a>`;
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
