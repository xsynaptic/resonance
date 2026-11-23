export interface LazyModule<Module> {
	load: () => Promise<Module>;
	preload: () => void;
}

// A bare message cannot be told from any other uncaught error, and the import failure's text varies by browser
export class LazyModuleError extends Error {
	readonly chunk: string;
	readonly reason: 'import' | 'offline';

	constructor(chunk: string, reason: 'import' | 'offline', options?: ErrorOptions) {
		super(`The ${chunk} chunk failed to open (${reason})`, options);

		this.chunk = chunk;
		this.name = 'LazyModuleError';
		this.reason = reason;
	}
}

// A failed import is cached for the life of the document, and the reload that would clear it stops playback
export function lazyModule<Module>(
	chunk: string,
	importModule: () => Promise<Module>,
): LazyModule<Module> {
	let pending: Promise<Module> | undefined;

	async function request(): Promise<Module> {
		try {
			return await importModule();
		} catch (error) {
			pending = undefined;
			throw new LazyModuleError(chunk, 'import', { cause: error });
		}
	}

	function load(): Promise<Module> {
		if (pending !== undefined) return pending;
		if (!navigator.onLine) return Promise.reject(new LazyModuleError(chunk, 'offline'));

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
