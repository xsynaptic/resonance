import type { EventValue } from '@xsynaptic/analytics';
import type { ControlPress, PlaybackDiagnostic, PlaybackEvent } from '@xsynaptic/plazmoid-core';
import type { PlayerEvent } from '@xsynaptic/plazmoid-player/astro';

import type { AnalyticsEvents } from '#lib/analytics/analytics-events.ts';

import { isOptedOut } from '#components/player/player-opt-out.ts';
import { sendEvent } from '#lib/analytics/analytics-events.ts';

const origins = {
	'play-track': 'mix',
	'play-tracks': 'playlist',
} as const;

// Read once, since none of the three can change while the document is open
const isSuppressed = import.meta.env.DEV || navigator.doNotTrack === '1' || isOptedOut();

// Umami caps a string at 500
const messageLength = 200;

const browserVersion = describeBrowser(navigator.userAgent);

// iOS 26 opens any Home Screen site as a web app, where WebKit's lock-screen audio bugs live
const isStandalone = matchMedia('(display-mode: standalone)').matches;

export function trackPlayerEvent(event: PlaybackEvent | PlayerEvent): void {
	if (isSuppressed) return;

	switch (event.kind) {
		case 'chunk-failed': {
			sendEvent('player-chunk-error', { chunk: event.chunk, reason: event.reason });
			break;
		}
		case 'diagnostic': {
			trackDiagnostic(event.diagnostic);
			break;
		}
		case 'failed': {
			trackPlaybackError(event);
			break;
		}
		case 'opened': {
			sendEvent(event.part === 'panel' ? 'player-panel-open' : 'player-overlay-open');
			break;
		}
	}
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

// Nothing failed on `capped` or `unplayable`, so neither carries a stage
function trackPlaybackError({
	error,
	status,
	trackId,
}: Extract<PlaybackEvent, { kind: 'failed' }>): void {
	const data: AnalyticsEvents['player-error'] = { status };

	if (trackId !== undefined) data.mix = trackId;
	if (error) data.stage = error.stage;

	sendEvent('player-error', data);
}
