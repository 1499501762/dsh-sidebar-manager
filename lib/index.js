/**
 * dsh-sidebar-manager — host half.
 *
 * The whole feature lives in the browser half (`exports["./client"]`, which DSH
 * discovers from this package's `dsh.client` declaration). The empty `apply`
 * exists only so the package is a mountable Loader row: the row is what makes
 * the client module reachable from the GUI.
 *
 * Deliberately dependency-free: no host routes, no tools, no settings schema —
 * a Sidebar row that fails to mount must never be able to take the boot down.
 */

/** Host plugin body — intentionally no host-side behaviour. */
export function apply() {}
