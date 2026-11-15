/**
 * The page's calls to the Worker's API. Each says the page's version, and a
 * 426 answer, which means the Worker runs another build, tells `onMismatched`.
 */
import { version, versionHeader } from "../capture/version.js";

let whenMismatched = () => {};

/** Runs `listener` when the Worker runs another build than this page. */
export const onMismatched = (listener: () => void) => {
  whenMismatched = listener;
};

export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);

  headers.set(versionHeader, version);

  const response = await fetch(path, { ...init, headers });

  if (response.status === 426) whenMismatched();

  return response;
};
