export interface LazyModule<Module> {
	load: () => Promise<Module>;
	preload: () => void;
}

// A failed import is cached for the life of the document, and the reload that would clear it stops playback
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
		if (pending !== undefined) return pending;
		if (!navigator.onLine) return Promise.reject(new Error('Offline, chunk not requested'));

		pending = request();

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
