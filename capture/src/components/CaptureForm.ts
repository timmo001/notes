/**
 * `capture-form`: the capture page. A repository picker, the note and Add
 * note, on Groundwork's `gw-` components and the page's theme.
 */
import { html, LitElement, type PropertyDeclarations } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { Option, Schema } from "effect";
import "@timmo001/groundwork-ui/gw-button.ts";
import "@timmo001/groundwork-ui/gw-input.ts";
import type { GwInput } from "@timmo001/groundwork-ui/gw-input.ts";
import "@timmo001/groundwork-ui/gw-page-header.ts";
import "@timmo001/groundwork-ui/gw-select.ts";
import type { GwSelect } from "@timmo001/groundwork-ui/gw-select.ts";
import "@timmo001/groundwork-ui/gw-theme-picker.ts";
import type { GwThemePicker } from "@timmo001/groundwork-ui/gw-theme-picker.ts";
import { captureErrorMessage, GENERIC_CAPTURE_ERROR } from "../capture/http.js";
import {
  RepositoryOptions,
  type RepositoryOption,
} from "../capture/repositories.js";
import {
  REPOSITORY_STORAGE_KEY,
  restoreRepository,
} from "../scripts/repositoryPicker.js";
import { bindThemePicker } from "../theme/picker.js";

const RepositoriesResponse = Schema.Struct({
  repositories: RepositoryOptions,
});

const CreatedIssueResponse = Schema.Struct({ url: Schema.String });

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
    submitting: { state: true },
    status: { state: true },
    issueUrl: { state: true },
  };

  declare private repositories: readonly RepositoryOption[];
  declare private selectedRepository: string;
  declare private submitting: boolean;
  declare private status: string;
  declare private issueUrl: string | undefined;

  private readonly note = createRef<GwInput>();
  private readonly repository = createRef<GwSelect>();
  private readonly picker = createRef<GwThemePicker>();

  private unbindTheme: (() => void) | undefined;

  constructor() {
    super();
    this.repositories = [];
    this.selectedRepository = "";
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

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.unbindTheme?.();
  }

  protected override firstUpdated() {
    if (this.picker.value !== undefined) {
      this.unbindTheme = bindThemePicker(this.picker.value);
    }

    void this.note.value?.updateComplete.then(() =>
      this.note.value?.querySelector("textarea")?.focus(),
    );
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

  private onRepositoryChange() {
    const repository = this.repository.value?.value ?? "";
    this.selectedRepository = repository;
    storeRepository(repository);
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const note = this.note.value;

    if (!note?.value.trim()) return;

    this.submitting = true;
    this.issueUrl = undefined;
    this.status = "Adding note...";
    let responseError: string | undefined;

    try {
      const response = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          requestId: crypto.randomUUID(),
          text: note.value,
          capturedAt: new Date().toISOString(),
          source: "text",
          repository: this.selectedRepository || undefined,
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

      note.value = "";
      this.issueUrl = issueUrl.href;
      this.status = "";
    } catch {
      this.status = responseError ?? GENERIC_CAPTURE_ERROR;
    } finally {
      this.submitting = false;
    }
  }

  private renderRepositoryPicker() {
    const options = [
      { value: "", label: "Automatic", description: "Infer from context" },
      ...this.repositories.map(({ label, repository }) => ({
        value: repository,
        label,
        description: repository,
        keywords: [repository],
      })),
    ];

    // Held at its size while the repositories load, so nothing moves
    return html`
      <gw-select
        class="repository"
        label="Repository"
        inline-label
        .options=${options}
        .value=${this.selectedRepository}
        ?disabled=${this.repositories.length === 0}
        ${ref(this.repository)}
        @change=${() => this.onRepositoryChange()}
      ></gw-select>
    `;
  }

  protected override render() {
    return html`
      <main>
        <gw-page-header heading="Capture a note">
          <gw-theme-picker
            slot="actions"
            layout="popover"
            gallery
            ${ref(this.picker)}
          ></gw-theme-picker>
        </gw-page-header>

        <form @submit=${(event: SubmitEvent) => void this.onSubmit(event)}>
          ${this.renderRepositoryPicker()}

          <gw-input
            label="Note"
            label-hidden
            name="capture"
            multiline
            rows="10"
            maxlength="12000"
            required
            placeholder="Write a note..."
            ${ref(this.note)}
          ></gw-input>

          <p class="status" role="status" aria-live="polite">
            ${
              this.issueUrl
                ? html`<a href=${this.issueUrl}>Note added</a>`
                : this.status
            }
          </p>
          <gw-button
            class="submit"
            type="submit"
            size="large"
            ?loading=${this.submitting}
          >
            Add note
          </gw-button>
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
