export interface LazyModule<Module> {
	load: () => Promise<Module>;
	preload: () => void;
}

// A rejected import is forgotten, so the next open asks the network again rather than replaying the failure
export function lazyModule<Module>(importModule: () => Promise<Module>): LazyModule<Module> {
	let pending: Promise<Module> | undefined;

	async function request(): Promise<Module> {
		try {
			return await importModule();
		} catch (error) {
			pending = undefined;
			throw error;
		}
	}

	function load(): Promise<Module> {
		if (pending === undefined) pending = request();

		return pending;
	}

	return {
		load,
		preload: () => {
			void settle(load());
		},
	};
}

async function settle(pending: Promise<unknown>): Promise<void> {
	try {
		await pending;
	} catch {
		// A failed preload surfaces again on open, where the part closes itself
	}
}
