// Every event name this site fires, so the set stays greppable from one file
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

// The Umami script is rendered under PROD only, so this reaches nothing anywhere else
export function trackEvent(name: AnalyticsEvent, data?: Record<string, number | string>): void {
	window.umami?.track(name, data);
}

declare global {
	interface Window {
		umami?: { track: (eventName: string, eventData?: Record<string, unknown>) => void };
	}
}
