import type { EventValue } from '@xsynaptic/analytics';
import type { PressOrigin } from '@xsynaptic/plazmoid-core';

import { createEventSender } from '@xsynaptic/analytics';
import { createUmamiAttributes, umamiTransport } from '@xsynaptic/analytics/umami';

// Built up from each diagnostic kind's own fields, which vary by kind and by browser
type PlayerDiagnosticPayload = Record<string, EventValue>;

export interface AnalyticsEvents {
	'build-version-reload': { staleHours: number };
	'cue-sheet-download': { mix: string };
	'player-chunk-error': { chunk: string; reason: 'import' | 'offline' };
	'player-error': { stage?: string; status: string; track?: string };
	'player-media-error': PlayerDiagnosticPayload;
	'player-next': { origin: PressOrigin; track: string };
	'player-overlay-open': undefined;
	'player-panel-open': undefined;
	'player-pause': { origin: PressOrigin; track: string };
	'player-pick': { origin: 'tray'; track: string };
	'player-play': { isResume: boolean; isStandalone: boolean; origin: PressOrigin; track: string };
	'player-play-rejected': PlayerDiagnosticPayload;
	'player-previous': { origin: PressOrigin; track: string };
	'player-queue-add': { origin: 'page'; track: string; trackCount: number };
	'player-queue-clear': { origin: 'tray'; trackCount: number };
	'player-queue-remove': { origin: 'tray'; track: string };
	'player-queue-reorder': { origin: 'tray'; track: string };
	'player-retry-recovered': PlayerDiagnosticPayload;
	'player-stall': PlayerDiagnosticPayload;
	'player-tray-open': undefined;
	'search-empty': { query: string };
	'search-open': undefined;
	'search-query': { clicked: boolean; query: string; results: number };
}

export const { sendEvent } = createEventSender<AnalyticsEvents>(umamiTransport);

export const { sendEventAttributes } = createUmamiAttributes<AnalyticsEvents>();
