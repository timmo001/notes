import { Schema } from "effect";
import type { IssuePayload } from "../issuePayload.js";

export interface CreatedIssue {
  readonly number: number;
  readonly url: string;
}

export interface GitHubIssueConfig {
  readonly owner: string;
  readonly repository: string;
  readonly token: string;
}

const GitHubIssueResponse = Schema.Struct({
  html_url: Schema.String,
  number: Schema.Number,
});

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function createGitHubIssue(
  payload: IssuePayload,
  config: GitHubIssueConfig,
  fetcher: Fetcher = fetch,
): Promise<CreatedIssue> {
  const response = await fetcher(
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/issues`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "User-Agent": "notes-capture",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub issue creation failed (${response.status})`);
  }

  let result: typeof GitHubIssueResponse.Type;
  try {
    result = Schema.decodeUnknownSync(GitHubIssueResponse)(
      await response.json(),
    );
  } catch {
    throw new Error("GitHub returned an invalid issue response");
  }
  return { number: result.number, url: result.html_url };
}
