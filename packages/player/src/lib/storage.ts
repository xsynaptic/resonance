export interface PlayerStorage {
	getItem: (key: string) => null | string | undefined;
	removeItem: (key: string) => void;
	setItem: (key: string, value: string) => void;
}

// For a secondary mount, which must neither show the listener's saved queue and volume nor write over them
export function createMemoryStorage(): PlayerStorage {
	const entries = new Map<string, string>();

	return {
		getItem: (key) => entries.get(key),
		removeItem: (key) => {
			entries.delete(key);
		},
		setItem: (key, value) => {
			entries.set(key, value);
		},
	};
}

// Reaching for `localStorage` throws where the getter does: Safari with cookies blocked, a sandboxed iframe
export function readStored(storage: PlayerStorage | undefined, key: string): string | undefined {
	try {
		return (storage ?? localStorage).getItem(key) ?? undefined;
	} catch {
		return undefined;
	}
}

export function removeStored(storage: PlayerStorage | undefined, key: string): void {
	try {
		(storage ?? localStorage).removeItem(key);
	} catch {
		return;
	}
}

export function writeStored(storage: PlayerStorage | undefined, key: string, value: string): void {
	try {
		(storage ?? localStorage).setItem(key, value);
	} catch {
		return;
	}
}
