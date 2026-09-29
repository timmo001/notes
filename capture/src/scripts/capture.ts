import { captureErrorMessage, GENERIC_CAPTURE_ERROR } from "../capture/http.js";
import { Option, Schema } from "effect";
import {
  filterRepositories,
  REPOSITORY_STORAGE_KEY,
  restoreRepository,
} from "./repositoryPicker.js";

interface Queryable {
  querySelector(selector: string): object | null;
  querySelectorAll(selector: string): ArrayLike<object>;
}

function queryElement<T>(
  root: Queryable,
  selector: string,
  type: abstract new () => T,
): T | null {
  const element = root.querySelector(selector);

  return element instanceof type ? element : null;
}

function queryElements<T>(
  root: Queryable,
  selector: string,
  type: abstract new () => T,
): T[] {
  return Array.from(root.querySelectorAll(selector)).flatMap((element) =>
    element instanceof type ? [element] : [],
  );
}

const form = queryElement(document, "[data-capture-form]", HTMLFormElement);

const textarea = queryElement(document, "#capture", HTMLTextAreaElement);

const status = queryElement(document, "[data-status]", HTMLElement);

const repositoryPicker = queryElement(
  document,
  "[data-repository-picker]",
  HTMLElement,
);

if (!form || !textarea || !status) {
  throw new Error("Capture form is incomplete");
}

let preserveRepositorySelection = () => {};

let repositoryForCapture: string | undefined;

if (repositoryPicker) {
  const repositoryValue = queryElement(
    repositoryPicker,
    "[data-repository-value]",
    HTMLInputElement,
  );

  const repositoryLabel = queryElement(
    repositoryPicker,
    "[data-repository-label]",
    HTMLElement,
  );

  const repositoryTrigger = queryElement(
    repositoryPicker,
    "[data-repository-trigger]",
    HTMLButtonElement,
  );

  const popover = queryElement(
    repositoryPicker,
    "[data-repository-popover]",
    HTMLElement,
  );

  const search = queryElement(
    repositoryPicker,
    "[data-repository-search]",
    HTMLInputElement,
  );

  const empty = queryElement(
    repositoryPicker,
    "[data-repository-empty]",
    HTMLElement,
  );

  const options = queryElements(
    repositoryPicker,
    "[data-repository-option]",
    HTMLButtonElement,
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
      `Target repository: ${repositoryLabel.textContent}`,
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

      if (repository === undefined) return;
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = queryElement(form, "[type=submit]", HTMLButtonElement);

  if (!submit || !textarea.value.trim()) return;

  submit.disabled = true;
  status.textContent = "Adding note...";
  let responseError: string | undefined;

  try {
    const capture = {
      version: 1,
      requestId: crypto.randomUUID(),
      text: textarea.value,
      capturedAt: new Date().toISOString(),
      source: "text",
      repository: repositoryForCapture,
    };

    const response = await fetch("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capture),
    });

    const result = await response.json();

    if (!response.ok) {
      responseError = captureErrorMessage(
        Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Json)(result)),
      );
      throw new Error("Capture request failed");
    }

    const issue = Schema.decodeUnknownOption(
      Schema.Struct({ url: Schema.String }),
    )(result);

    if (Option.isNone(issue)) {
      throw new Error("Capture request failed");
    }

    const issueUrl = new URL(issue.value.url);

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
    status.textContent = responseError ?? GENERIC_CAPTURE_ERROR;
  } finally {
    submit.disabled = false;
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js");
  });
}
