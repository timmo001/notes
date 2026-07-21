import {
  collectSpeechResult,
  createSpeechRecognition,
  speechRecognitionConstructor,
} from "./speech.js";
import {
  filterRepositories,
  REPOSITORY_STORAGE_KEY,
  restoreRepository,
} from "./repositoryPicker.js";

const form = document.querySelector<HTMLFormElement>("[data-capture-form]");
const textarea = document.querySelector<HTMLTextAreaElement>("#capture");
const record = document.querySelector<HTMLButtonElement>("[data-record]");
const status = document.querySelector<HTMLElement>("[data-status]");
const repositoryPicker = document.querySelector<HTMLElement>(
  "[data-repository-picker]",
);

if (!form || !textarea || !record || !status) {
  throw new Error("Capture form is incomplete");
}

let source: "text" | "speech" = "text";
let listening = false;
let transcriptBeforeRecording = "";
let preserveRepositorySelection = () => {};
let repositoryForCapture: string | undefined;
const Constructor = speechRecognitionConstructor();

if (repositoryPicker) {
  const repositoryValue = repositoryPicker.querySelector<HTMLInputElement>(
    "[data-repository-value]",
  );
  const repositoryLabel = repositoryPicker.querySelector<HTMLElement>(
    "[data-repository-label]",
  );
  const repositoryTrigger = repositoryPicker.querySelector<HTMLButtonElement>(
    "[data-repository-trigger]",
  );
  const popover = repositoryPicker.querySelector<HTMLElement>(
    "[data-repository-popover]",
  );
  const search = repositoryPicker.querySelector<HTMLInputElement>(
    "[data-repository-search]",
  );
  const empty = repositoryPicker.querySelector<HTMLElement>(
    "[data-repository-empty]",
  );
  const options = Array.from(
    repositoryPicker.querySelectorAll<HTMLButtonElement>(
      "[data-repository-option]",
    ),
  );

  if (
    !repositoryValue ||
    !repositoryLabel ||
    !repositoryTrigger ||
    !popover ||
    !search ||
    !empty
  ) {
    throw new Error("Repository picker is incomplete");
  }

  let selectedRepository = repositoryValue.value;
  const selectRepository = (repository: string) => {
    const selected = options.find(
      (option) => option.dataset.repositoryOption === repository,
    );
    if (!selected) return;

    repositoryValue.value = repository;
    repositoryLabel.textContent =
      selected.querySelector("span")?.textContent ?? repository;
    repositoryTrigger.setAttribute(
      "aria-label",
      `Repository: ${repositoryLabel.textContent}`,
    );
    selectedRepository = repository;
    repositoryForCapture = repository;
    for (const option of options) {
      option.setAttribute(
        "aria-pressed",
        String(option.dataset.repositoryOption === repository),
      );
    }
  };

  let storedRepository: string | null = null;
  try {
    storedRepository = localStorage.getItem(REPOSITORY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable without preventing capture submission.
  }
  selectRepository(
    restoreRepository(
      storedRepository,
      options.flatMap((option) => option.dataset.repositoryOption ?? []),
      repositoryValue.value,
    ),
  );
  preserveRepositorySelection = () => selectRepository(selectedRepository);

  if (!("showPopover" in HTMLElement.prototype)) {
    repositoryPicker.hidden = true;
    repositoryForCapture = undefined;
  }

  for (const option of options) {
    option.addEventListener("click", () => {
      const repository = option.dataset.repositoryOption;
      if (!repository) return;
      selectRepository(repository);
      try {
        localStorage.setItem(REPOSITORY_STORAGE_KEY, repository);
      } catch {
        // Keep the in-page selection when persistence is blocked.
      }
      popover.hidePopover?.();
    });
  }

  search.addEventListener("input", () => {
    const visible = new Set(
      filterRepositories(
        options.map((option) => ({
          repository: option.dataset.repositoryOption ?? "",
          searchText: option.dataset.repositorySearchText ?? "",
        })),
        search.value,
      ),
    );
    for (const option of options) {
      option.hidden = !visible.has(option.dataset.repositoryOption ?? "");
    }
    empty.hidden = visible.size > 0;
  });

  popover.addEventListener("toggle", (event) => {
    if (event instanceof ToggleEvent && event.newState === "open") {
      search.value = "";
      search.dispatchEvent(new Event("input"));
      search.focus();
    }
  });
}

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
        ...(repositoryForCapture ? { repository: repositoryForCapture } : {}),
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
    const issueUrl = new URL(result.url);
    if (issueUrl.protocol !== "https:" || issueUrl.hostname !== "github.com") {
      throw new Error("Unexpected issue URL");
    }
    form.reset();
    preserveRepositorySelection();
    const link = document.createElement("a");
    link.href = issueUrl.href;
    link.textContent = "Note added";
    status.replaceChildren(link);
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
