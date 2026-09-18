// Set by hand, once per browser; there is no UI for it
const optOutKey = 'stats:v1:opt-out';

// A browser that refuses storage has set nothing, so a throw reads as not opted out
export function isOptedOut(): boolean {
	try {
		return localStorage.getItem(optOutKey) === '1';
	} catch {
		return false;
	}
}
