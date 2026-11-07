/**
 * /tickets — Alias for /ticketsetup.
 *
 * Re-exports the /ticketsetup command definition rather than rebuilding it, so
 * the alias can never drift from the command it points at.
 */
import { data, execute } from "./ticketsetup.js";

export { data, execute };

export default { data, execute };