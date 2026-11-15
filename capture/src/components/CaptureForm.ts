/**
 * `capture-form`: the capture page. A repository picker, the note and Add
 * note, on Groundwork's `gw-` components and the page's theme. It also offers
 * to install the app, takes a share into the note, and moves itself onto a
 * new build when the Worker refuses its version.
 */
import { html, LitElement, type PropertyDeclarations } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { Option, Schema } from "effect";
import "@timmo001/groundwork-ui/define/gw-banner.ts";
import "@timmo001/groundwork-ui/define/gw-button.ts";
import "@timmo001/groundwork-ui/define/gw-input.ts";
import type { GwInput } from "@timmo001/groundwork-ui/gw-input.ts";
import "@timmo001/groundwork-ui/define/gw-page-header.ts";
import "@timmo001/groundwork-ui/define/gw-select.ts";
import type { GwSelect } from "@timmo001/groundwork-ui/gw-select.ts";
import "@timmo001/groundwork-ui/define/gw-theme-picker.ts";
import type { GwThemePicker } from "@timmo001/groundwork-ui/gw-theme-picker.ts";
import { captureErrorMessage, GENERIC_CAPTURE_ERROR } from "../capture/http.js";
import {
  RepositoryOptions,
  type RepositoryOption,
} from "../capture/repositories.js";
import { version } from "../capture/version.js";
import { apiFetch, onMismatched } from "../pwa/api.js";
import { pwa } from "../pwa/pwa.js";
import { reloadForUpdate } from "../pwa/update.js";
import {
  REPOSITORY_STORAGE_KEY,
  restoreRepository,
} from "../scripts/repositoryPicker.js";
import { shareNote } from "../scripts/shareNote.js";
import { bindThemePicker } from "../theme/picker.js";

const INSTALL_DISMISSED_KEY = "notes-capture:install-dismissed";
const RELOADED_KEY = "notes-capture:reloaded-for-version";
const DRAFT_KEY = "notes-capture:draft";

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

function attempt<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    // Storage can be blocked without stopping the page.
    return fallback;
  }
}

export class CaptureForm extends LitElement {
  static override properties: PropertyDeclarations = {
    repositories: { state: true },
    selectedRepository: { state: true },
    submitting: { state: true },
    status: { state: true },
    issueUrl: { state: true },
    canInstall: { state: true },
    installDismissed: { state: true },
    outdated: { state: true },
  };

  declare private repositories: readonly RepositoryOption[];
  declare private selectedRepository: string;
  declare private submitting: boolean;
  declare private status: string;
  declare private issueUrl: string | undefined;
  declare private canInstall: boolean;
  declare private installDismissed: boolean;
  declare private outdated: boolean;

  private readonly note = createRef<GwInput>();
  private readonly repository = createRef<GwSelect>();
  private readonly picker = createRef<GwThemePicker>();

  private unbindTheme: (() => void) | undefined;
  private updating = false;

  constructor() {
    super();
    this.repositories = [];
    this.selectedRepository = "";
    this.submitting = false;
    this.status = "";
    this.issueUrl = undefined;
    this.canInstall = pwa.canInstall();
    this.installDismissed =
      attempt(() => localStorage.getItem(INSTALL_DISMISSED_KEY), null) !== null;
    this.outdated = false;
  }

  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("gw-share", this.onShare);
    window.addEventListener("gw-install-change", this.onInstallChange);
    onMismatched(() => this.onMismatched());
    void this.loadRepositories();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("gw-share", this.onShare);
    window.removeEventListener("gw-install-change", this.onInstallChange);
    this.unbindTheme?.();
  }

  protected override firstUpdated() {
    if (this.picker.value !== undefined) {
      this.unbindTheme = bindThemePicker(this.picker.value);
    }

    // A draft kept across a reload onto a new version
    const draft = attempt(() => sessionStorage.getItem(DRAFT_KEY), null);

    if (draft !== null && this.note.value !== undefined) {
      this.note.value.value = draft;
      attempt(() => sessionStorage.removeItem(DRAFT_KEY), undefined);
    }

    void this.note.value?.updateComplete.then(() =>
      this.note.value?.querySelector("textarea")?.focus(),
    );
  }

  private readonly onShare = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;

    const shared = shareNote(event.detail);

    if (shared === "") return;

    // A share can arrive before the first render, so wait for the field
    void this.updateComplete.then(() => {
      const note = this.note.value;

      if (note === undefined) return;

      // Added to what's already written, so a share never replaces a note
      note.value = note.value === "" ? shared : `${note.value}\n\n${shared}`;
      this.issueUrl = undefined;
      this.status = "";
    });
  };

  private readonly onInstallChange = () => {
    this.canInstall = pwa.canInstall();
  };

  // The Worker was deployed since the browser kept this page. The page moves
  // onto the new build once by itself, with the note kept, and says so where
  // that didn't help
  private onMismatched() {
    if (this.updating || this.outdated) return;

    if (attempt(() => sessionStorage.getItem(RELOADED_KEY), null) !== version) {
      attempt(() => sessionStorage.setItem(RELOADED_KEY, version), undefined);
      this.updating = true;

      const text = this.note.value?.value ?? "";

      if (text !== "") {
        attempt(() => sessionStorage.setItem(DRAFT_KEY, text), undefined);
      }

      void reloadForUpdate(pwa);

      return;
    }

    this.outdated = true;
  }

  private turnDownInstall() {
    attempt(
      () =>
        localStorage.setItem(INSTALL_DISMISSED_KEY, new Date().toISOString()),
      undefined,
    );
    this.installDismissed = true;
  }

  private async install() {
    if ((await pwa.install()) === "dismissed") this.turnDownInstall();
  }

  private async loadRepositories() {
    try {
      const response = await apiFetch("/api/repositories");

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
      const response = await apiFetch("/api/captures", {
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
      <!-- A page from another build than the Worker's, such as one the
           browser kept from before a deploy -->
      <gw-banner tone="warning" urgent ?open=${this.outdated}>
        <p>Capture was updated on the server. Reload to use the new version.</p>
        <gw-button
          slot="actions"
          size="small"
          @click=${() => location.reload()}
        >
          Reload
        </gw-button>
      </gw-banner>
      <!-- The offer to install, until it's turned down once; then only the
           header's button offers it -->
      <gw-banner ?open=${this.canInstall && !this.installDismissed}>
        <p>Install Capture to open it in its own window, like any other app.</p>
        <gw-button
          slot="actions"
          size="small"
          @click=${() => void this.install()}
        >
          Install
        </gw-button>
        <gw-button
          slot="actions"
          size="small"
          appearance="plain"
          variant="neutral"
          @click=${() => this.turnDownInstall()}
        >
          Not now
        </gw-button>
      </gw-banner>
      <main>
        <gw-page-header heading="Capture a note">
          <gw-button
            slot="actions"
            size="small"
            appearance="outlined"
            variant="neutral"
            ?hidden=${!this.canInstall}
            @click=${() => void this.install()}
          >
            Install
          </gw-button>
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
