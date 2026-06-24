/**
 * Public surface of the shared checkpoint core. Adapters import only from here.
 *
 * Capabilities (added across implementation phases): detectProject, optIn, disable, status,
 * sessionStart, capture, archive. See contracts/core-interface.md.
 */

export * from "./types.js";
export { archive, capture, detectProject, disable, optIn, sessionStart, status } from "./api.js";
export { migrateConfig } from "./migrate.js";
