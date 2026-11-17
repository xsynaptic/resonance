import { createEventSender } from '@xsynaptic/analytics';
import { createUmamiAttributes, umamiTransport } from '@xsynaptic/analytics/umami';

// Built up from each diagnostic kind's own fields, which vary by kind and by browser
type PlayerDiagnosticPayload = Record<string, boolean | number | string>;

export interface AnalyticsEvents {
	'build-version-reload': { staleHours: number };
	'cue-sheet-download': { mix: string };
	'player-chunk-error': { chunk: string; reason: 'import' | 'offline' };
	'player-error': { mix?: string; stage?: string; status: string };
	'player-media-error': PlayerDiagnosticPayload;
	'player-overlay-open': undefined;
	'player-panel-open': undefined;
	'player-play': { isStandalone: boolean; mix: string; origin: 'mix' | 'playlist' };
	'player-play-rejected': PlayerDiagnosticPayload;
	'player-queue-add': { mix: string };
	'player-retry-recovered': PlayerDiagnosticPayload;
	'player-stall': PlayerDiagnosticPayload;
	'search-empty': { query: string };
	'search-open': undefined;
	'search-query': { clicked: boolean; query: string; results: number };
}

export const { sendEvent } = createEventSender<AnalyticsEvents>(umamiTransport);

export const { sendEventAttributes } = createUmamiAttributes<AnalyticsEvents>();
