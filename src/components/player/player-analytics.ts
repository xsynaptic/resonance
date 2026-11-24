import type { EventValue } from '@xsynaptic/analytics';
import type {
	ControlPress,
	PlaybackDiagnostic,
	PlayerStatus,
	PlayerStore,
	PlayerStoreApi,
} from '@xsynaptic/plazmoid-core';
import type { ViewStoreApi } from '@xsynaptic/plazmoid-player';

import { loadedTrack } from '@xsynaptic/plazmoid-core';
import { LazyModuleError } from '@xsynaptic/plazmoid-player';

import type { AnalyticsEvents } from '#lib/analytics/analytics-events.ts';

import { isOptedOut } from '#components/player/player-opt-out.ts';
import { sendEvent } from '#lib/analytics/analytics-events.ts';

const origins = {
	'play-track': 'mix',
	'play-tracks': 'playlist',
} as const;

// Nothing failed on `capped` or `unplayable`, so neither carries a stage
const terminalStatuses: ReadonlySet<PlayerStatus> = new Set(['capped', 'error', 'unplayable']);

// Read once, since none of the three can change while the document is open
const isSuppressed = import.meta.env.DEV || navigator.doNotTrack === '1' || isOptedOut();

// Umami caps a string at 500
const messageLength = 200;

const browserVersion = describeBrowser(navigator.userAgent);

// iOS 26 opens any Home Screen site as a web app, where WebKit's lock-screen audio bugs live
const isStandalone = matchMedia('(display-mode: standalone)').matches;

export function bindPlayerAnalytics(store: PlayerStoreApi, view: ViewStoreApi): () => void {
	if (isSuppressed) return doNothing;

	const connection = new AbortController();

	let { status } = store.getState();
	let diagnostic = store.getState().diagnostic;

	// Selected and compared rather than read straight, since `currentTimeSeconds` moves about four times a second
	const unsubscribe = store.subscribe((state) => {
		if (state.diagnostic !== diagnostic) {
			diagnostic = state.diagnostic;
			if (diagnostic) trackDiagnostic(diagnostic);
		}

		if (state.status === status) return;

		({ status } = state);
		if (terminalStatuses.has(status)) trackPlaybackError(state);
	});
	const unsubscribeView = view.subscribe((next, previous) => {
		if (next.isPanelOpen && !previous.isPanelOpen) sendEvent('player-panel-open');
		if (next.isOverlayOpen && !previous.isOverlayOpen) sendEvent('player-overlay-open');
	});

	window.addEventListener('error', trackChunkError, { signal: connection.signal });

	return () => {
		connection.abort();
		unsubscribe();
		unsubscribeView();
	};
}

export function trackControlPress({ trackIds, verb }: ControlPress): void {
	if (isSuppressed || verb === 'toggle-tracks' || verb === 'queue-tracks') return;

	// Every other verb plays from the top of what it queued, so the first id is the Mix that starts
	const mix = trackIds[0];
	if (mix === undefined) return;

	if (verb === 'queue-track') {
		sendEvent('player-queue-add', { mix });
		return;
	}

	sendEvent('player-play', { isStandalone, mix, origin: origins[verb] });
}

// Parsed rather than sent raw: versions are what gets grouped by, and the full string is needless entropy
function describeBrowser(userAgent: string): string {
	const browser = matchVersion(userAgent, [
		['Edge', /Edg(?:A|iOS)?\/(\d+)\.(\d+)/],
		['Firefox', /(?:Firefox|FxiOS)\/(\d+)\.(\d+)/],
		['Chrome', /(?:Chrome|CriOS)\/(\d+)\.(\d+)/],
		['Safari', /Version\/(\d+)\.(\d+).*Safari/],
	]);

	const system = matchVersion(userAgent, [
		['iOS', /(?:iPhone|iPad|iPod).*? OS (\d+)_(\d+)/],
		['Android', /Android (\d+)(?:\.(\d+))?/],
		['Windows', /Windows NT (\d+)\.(\d+)/],
		['macOS', /Mac OS X (\d+)[._](\d+)/],
	]);

	// iOS in-app views omit `Version/`, and their WebKit ships with the OS
	if (browser === undefined && system?.startsWith('iOS')) return `WebKit / ${system}`;
	if (browser === undefined) return 'other';

	return `${browser} / ${system ?? 'other'}`;
}

function doNothing(): void {
	// Nothing was bound, so there is nothing to unbind
}

function matchVersion(
	userAgent: string,
	families: ReadonlyArray<readonly [string, RegExp]>,
): string | undefined {
	for (const [family, pattern] of families) {
		const [, major, minor] = pattern.exec(userAgent) ?? [];
		if (major === undefined) continue;

		return minor === undefined ? `${family} ${major}` : `${family} ${major}.${minor}`;
	}

	return undefined;
}

function trackChunkError(event: ErrorEvent): void {
	const error: unknown = event.error;
	if (!(error instanceof LazyModuleError)) return;

	sendEvent('player-chunk-error', { chunk: error.chunk, reason: error.reason });
}

function trackDiagnostic({ kind, trackId, ...fields }: PlaybackDiagnostic): void {
	const data: Record<string, EventValue> = {
		...fields,
		isStandalone,
		mix: trackId,
		version: browserVersion,
	};

	if ('message' in fields) data.message = fields.message.slice(0, messageLength);

	sendEvent(`player-${kind}`, data);
}

function trackPlaybackError(state: PlayerStore): void {
	const { playbackError } = state;
	const data: AnalyticsEvents['player-error'] = { status: state.status };
	const trackId = loadedTrack(state)?.trackId;

	if (trackId !== undefined) data.mix = trackId;
	if (playbackError) data.stage = playbackError.stage;

	sendEvent('player-error', data);
}
