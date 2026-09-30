import { html, LitElement, nothing, type PropertyDeclarations } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { Option, Schema } from "effect";
import { captureErrorMessage, GENERIC_CAPTURE_ERROR } from "../capture/http.js";
import {
  RepositoryOptions,
  type RepositoryOption,
} from "../capture/repositories.js";
import {
  filterRepositories,
  REPOSITORY_STORAGE_KEY,
  restoreRepository,
} from "../scripts/repositoryPicker.js";

const AUTOMATIC = {
  label: "Automatic",
  repository: "",
  detail: "Infer from context",
  searchText: "Automatic infer from context local captures",
};

const RepositoriesResponse = Schema.Struct({
  repositories: RepositoryOptions,
});

const CreatedIssueResponse = Schema.Struct({ url: Schema.String });

const supportsPopover = "showPopover" in HTMLElement.prototype;

function readStoredRepository() {
  try {
    return localStorage.getItem(REPOSITORY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable without preventing capture submission.
    return null;
  }
}

function storeRepository(repository: string) {
  try {
    localStorage.setItem(REPOSITORY_STORAGE_KEY, repository);
  } catch {
    // Keep the in-page selection when persistence is blocked.
  }
}

export class CaptureForm extends LitElement {
  static override properties: PropertyDeclarations = {
    repositories: { state: true },
    selectedRepository: { state: true },
    repositoryQuery: { state: true },
    submitting: { state: true },
    status: { state: true },
    issueUrl: { state: true },
  };

  declare private repositories: readonly RepositoryOption[];
  declare private selectedRepository: string;
  declare private repositoryQuery: string;
  declare private submitting: boolean;
  declare private status: string;
  declare private issueUrl: string | undefined;

  private readonly textarea = createRef<HTMLTextAreaElement>();
  private readonly repositoryPopover = createRef<HTMLElement>();
  private readonly search = createRef<HTMLInputElement>();

  constructor() {
    super();
    this.repositories = [];
    this.selectedRepository = "";
    this.repositoryQuery = "";
    this.submitting = false;
    this.status = "";
    this.issueUrl = undefined;
  }

  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    void this.loadRepositories();
  }

  protected override firstUpdated() {
    this.textarea.value?.focus();
  }

  private async loadRepositories() {
    try {
      const response = await fetch("/api/repositories");

      if (!response.ok) return;

      const result = Schema.decodeUnknownOption(RepositoriesResponse)(
        await response.json(),
      );

      if (Option.isNone(result)) return;

      this.repositories = result.value.repositories;
      this.selectedRepository = restoreRepository(
        readStoredRepository(),
        this.repositories.map(({ repository }) => repository),
      );
    } catch {
      // Without the picker, captures still go to the automatic target.
    }
  }

  private selectRepository(repository: string) {
    this.selectedRepository = repository;
    storeRepository(repository);
    this.repositoryPopover.value?.hidePopover();
  }

  private onPopoverToggle(event: ToggleEvent) {
    if (event.newState !== "open") return;

    this.repositoryQuery = "";
    this.search.value?.focus();
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const textarea = this.textarea.value;

    if (!textarea?.value.trim()) return;

    this.submitting = true;
    this.issueUrl = undefined;
    this.status = "Adding note...";
    let responseError: string | undefined;

    try {
      const repository =
        supportsPopover && this.repositories.length > 0
          ? this.selectedRepository
          : "";

      const response = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          requestId: crypto.randomUUID(),
          text: textarea.value,
          capturedAt: new Date().toISOString(),
          source: "text",
          repository: repository || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        responseError = captureErrorMessage(
          Option.getOrUndefined(
            Schema.decodeUnknownOption(Schema.Json)(result),
          ),
        );
        throw new Error("Capture request failed");
      }

      const issue = Schema.decodeUnknownOption(CreatedIssueResponse)(result);

      if (Option.isNone(issue)) {
        throw new Error("Capture request failed");
      }

      const issueUrl = new URL(issue.value.url);

      if (
        issueUrl.protocol !== "https:" ||
        issueUrl.hostname !== "github.com"
      ) {
        throw new Error("Unexpected issue URL");
      }

      textarea.value = "";
      this.issueUrl = issueUrl.href;
      this.status = "";
    } catch {
      this.status = responseError ?? GENERIC_CAPTURE_ERROR;
    } finally {
      this.submitting = false;
    }
  }

  private renderRepositoryPicker() {
    if (!supportsPopover || this.repositories.length === 0) return nothing;

    const options = [
      AUTOMATIC,
      ...this.repositories.map(({ label, repository }) => ({
        label,
        repository,
        detail: repository,
        searchText: `${label} ${repository}`,
      })),
    ];

    const visible = new Set(filterRepositories(options, this.repositoryQuery));

    const selectedLabel =
      options.find(({ repository }) => repository === this.selectedRepository)
        ?.label ?? AUTOMATIC.label;

    return html`
      <div class="repository-picker">
        <button
          class="repository-trigger"
          type="button"
          popovertarget="repository-popover"
          aria-label="Target repository: ${selectedLabel}"
        >
          <span>${selectedLabel}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 10 5 5 5-5" />
          </svg>
        </button>
        <div
          class="repository-popover"
          id="repository-popover"
          popover="auto"
          ${ref(this.repositoryPopover)}
          @toggle=${(event: ToggleEvent) => this.onPopoverToggle(event)}
        >
          <label class="sr-only" for="repository-search">
            Search repositories
          </label>
          <input
            class="repository-search"
            id="repository-search"
            type="search"
            placeholder="Search repositories..."
            autocomplete="off"
            .value=${this.repositoryQuery}
            ${ref(this.search)}
            @input=${(event: InputEvent) => {
              if (event.target instanceof HTMLInputElement) {
                this.repositoryQuery = event.target.value;
              }
            }}
          />
          <div class="repository-options">
            ${options.map(
              (option) => html`
                <button
                  class="repository-option"
                  type="button"
                  aria-pressed=${option.repository === this.selectedRepository}
                  ?hidden=${!visible.has(option.repository)}
                  @click=${() => this.selectRepository(option.repository)}
                >
                  <span>${option.label}</span>
                  <small>${option.detail}</small>
                </button>
              `,
            )}
          </div>
          <p class="repository-empty" ?hidden=${visible.size > 0}>
            No matching repositories
          </p>
        </div>
      </div>
    `;
  }

  protected override render() {
    return html`
      <main>
        <header>
          <h1>Capture a note</h1>
        </header>

        <form @submit=${(event: SubmitEvent) => void this.onSubmit(event)}>
          ${this.renderRepositoryPicker()}

          <label class="sr-only" for="capture">Note</label>
          <textarea
            id="capture"
            name="capture"
            rows="10"
            maxlength="12000"
            required
            placeholder="Write a note..."
            ${ref(this.textarea)}
          ></textarea>

          <p class="status" role="status" aria-live="polite">
            ${
              this.issueUrl
                ? html`<a href=${this.issueUrl}>Note added</a>`
                : this.status
            }
          </p>
          <button class="submit" type="submit" ?disabled=${this.submitting}>
            Add note
          </button>
        </form>
      </main>
    `;
  }
}

customElements.define("capture-form", CaptureForm);

declare global {
  interface HTMLElementTagNameMap {
    "capture-form": CaptureForm;
  }
}
