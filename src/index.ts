/**
 * pi-packages — in-TUI package manager for pi.
 *
 * Registers `/packages` (alias `/pkg`): lists every configured package with
 * its version number / pinned ref, detects available updates on demand, and
 * installs / updates / removes packages by orchestrating the `pi` CLI.
 * Full spec: PRD.md.
 *
 * STATUS: scaffold. This stub wires up the command surface so the package is
 * loadable and installable; the interactive manager lands in the MVP phase
 * (PRD §11). Running `/packages` today only confirms the package loaded.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SCAFFOLD_MSG =
	"pi-packages: scaffold loaded — interactive manager not implemented yet (see PRD.md §11).";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("packages", {
		description:
			"Manage pi packages — list versions, check updates, install/update/remove (scaffold)",
		handler: async (_args, ctx) => {
			if (ctx.hasUI) ctx.ui.notify(SCAFFOLD_MSG, "info");
		},
	});

	pi.registerCommand("pkg", {
		description: "Alias for /packages (scaffold)",
		handler: async (_args, ctx) => {
			if (ctx.hasUI) ctx.ui.notify(SCAFFOLD_MSG, "info");
		},
	});
}
