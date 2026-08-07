import { describe, expect, it } from "vitest";

describe("pi-packages scaffold", () => {
	it("registers /packages and /pkg without throwing", async () => {
		const factory = (await import("../src/index.js")).default;

		const registered: string[] = [];
		const fakePi = {
			registerCommand: (name: string) => registered.push(name),
		};

		factory(fakePi as never);

		expect(registered).toEqual(expect.arrayContaining(["packages", "pkg"]));
	});
});
