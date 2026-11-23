import { commentFields } from '#fields.ts';

export interface FormMemory {
	clear: () => void;
	read: () => Record<string, unknown> | undefined;
	save: (details: Record<string, string>) => void;
}

export const storedFields = [
	commentFields.author,
	commentFields.authorEmail,
	commentFields.authorUrl,
] as const;

export function createFormMemory(storageKey: string): FormMemory {
	return {
		clear() {
			try {
				localStorage.removeItem(storageKey);
			} catch {
				// A browser with storage disabled has nothing to clear
			}
		},
		read(): Record<string, unknown> | undefined {
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
		},
		save(details) {
			try {
				localStorage.setItem(storageKey, JSON.stringify(details));
			} catch {
				// Storage full or disabled; the comment still submits
			}
		},
	};
}
