import { statsOptOutStorageKey } from '#components/main/main-storage-keys.ts';

// A browser that refuses storage has set nothing, so a throw reads as not opted out
export function isOptedOut(): boolean {
	try {
		return localStorage.getItem(statsOptOutStorageKey) === '1';
	} catch {
		return false;
	}
}
