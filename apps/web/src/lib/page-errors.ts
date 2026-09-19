import { notFound } from "next/navigation";
import { ApiError } from "./api";

/**
 * For server-component loaders. The API saying 404/403 (or rejecting a
 * malformed id) means "not found". Anything else is rethrown: an outage then
 * shows the self-recovering reconnecting screen and a real bug shows the
 * error page, instead of both pretending the page doesn't exist. Before
 * 2026-09-19 these loaders called notFound() for every error, so a brief API
 * restart made profiles, entries, letters and polls "404".
 */
export function notFoundOrRethrow(err: unknown): never {
  if (err instanceof ApiError && [400, 403, 404, 422].includes(err.status)) notFound();
  throw err;
}
