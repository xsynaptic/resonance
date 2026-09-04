const storageKey = 'comment-form-details';

export const storedFields = ['author', 'authorEmail', 'authorUrl'] as const;

export function clearStoredDetails(): void {
	try {
		localStorage.removeItem(storageKey);
	} catch {
		// A browser with storage disabled has nothing to clear
	}
}

export function readStoredDetails(): Record<string, unknown> | undefined {
	try {
		const raw = localStorage.getItem(storageKey);

		if (!raw) return undefined;

		const parsed: unknown = JSON.parse(raw);

		return typeof parsed === 'object' && parsed !== null
			? (parsed as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

export function saveStoredDetails(details: Record<string, string>): void {
	try {
		localStorage.setItem(storageKey, JSON.stringify(details));
	} catch {
		// Storage full or disabled; the comment still submits
	}
}
