/**
 * Public surface of the shared checkpoint core. Adapters import only from here.
 *
 * Capabilities (added across implementation phases): detectProject, optIn, disable, status,
 * sessionStart, capture. See contracts/core-interface.md.
 */

export * from "./types.js";
export { detectProject } from "./api.js";
