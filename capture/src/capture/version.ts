/**
 * The build's version, which the page and the Worker share: the build sets it
 * in both, so a page from another build than the Worker's, such as one the
 * browser kept from before a deploy, is told to reload instead of calling an
 * API it no longer matches.
 */
export const version = process.env.GROUNDWORK_PWA_VERSION ?? "dev";

/** The header the page sends its version in. */
export const versionHeader = "x-capture-version";
