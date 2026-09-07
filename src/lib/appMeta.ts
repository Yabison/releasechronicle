import pkg from "../../package.json";

export const APP_NAME = "Release Chronicle";

/**
 * What the UI shows, and what the image is tagged with — the same string.
 *
 * The CI stamps NEXT_PUBLIC_RC_VERSION at build time (see the RC_VERSION build arg
 * in the Dockerfile): on the rc branch it is the version the next release will
 * carry, suffixed `-rc`, because package.json still holds the *previous* release
 * until release-please merges its pull request. Outside the CI — `npm run dev`, a
 * local build — the variable is unset and package.json is the honest answer.
 *
 * Read as a whole `process.env.X` expression on purpose: Next inlines those
 * literally at build time, and destructuring would leave it undefined in the
 * browser bundle.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_RC_VERSION || pkg.version;
