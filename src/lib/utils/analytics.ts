type AnalyticsEvent =
	| 'cue-sheet-download'
	| 'player-chunk-error'
	| 'player-error'
	| 'player-overlay-open'
	| 'player-panel-open'
	| 'player-play'
	| 'player-queue-add'
	| 'search-open'
	| 'search-query';

interface UmamiApi {
	track: (eventName: string, eventData?: Record<string, unknown>) => void;
}

// The Umami script is rendered under PROD only, so this reaches nothing anywhere else
export function trackEvent(name: AnalyticsEvent, data?: Record<string, number | string>): void {
	const { umami } = globalThis as typeof globalThis & { umami?: UmamiApi };

	umami?.track(name, data);
}
