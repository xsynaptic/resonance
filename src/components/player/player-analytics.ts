import type { EventValue } from '@xsynaptic/analytics';
import type { PlaybackDiagnostic, PlaybackEvent, PlayerPress } from '@xsynaptic/plazmoid-core';
import type { PlayerEvent } from '@xsynaptic/plazmoid-player/astro';

import type { AnalyticsEvents } from '#lib/analytics/analytics-events.ts';

import { isOptedOut } from '#components/player/player-opt-out.ts';
import { sendEvent } from '#lib/analytics/analytics-events.ts';

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
	}
}

export function trackControlPress(press: PlayerPress): void {
	if (isSuppressed) return;

	switch (press.action) {
		case 'clear': {
			// The tray reports Clear on an empty Queue too, where nothing was cleared
			if (press.trackCount === 0) return;

			sendEvent('player-queue-clear', { origin: press.origin, trackCount: press.trackCount });
			break;
		}
		case 'move': {
			sendEvent('player-queue-reorder', { origin: press.origin, track: press.trackId });
			break;
		}
		case 'next':
		case 'pause':
		case 'pick':
		case 'previous': {
			sendEvent(`player-${press.action}`, { origin: press.origin, track: press.trackId });
			break;
		}
		case 'open': {
			sendEvent(`player-${press.part}-open`);
			break;
		}
		case 'play': {
			const { isResume, origin, trackId } = press;

			sendEvent('player-play', { isResume, isStandalone, origin, track: trackId });
			break;
		}
		// A page play always loads its Mix; one already loaded arrives as `play` or `pause` instead
		case 'play-track':
		case 'play-tracks': {
			sendEvent('player-play', {
				isResume: false,
				isStandalone,
				origin: press.origin,
				track: press.trackId,
			});
			break;
		}
		case 'queue-track': {
			sendEvent('player-queue-add', { origin: press.origin, track: press.trackId, trackCount: 1 });
			break;
		}
		case 'queue-tracks': {
			const [track] = press.trackIds;

			if (track === undefined) return;

			sendEvent('player-queue-add', {
				origin: press.origin,
				track,
				trackCount: press.trackIds.length,
			});
			break;
		}
		case 'remove': {
			sendEvent('player-queue-remove', { origin: press.origin, track: press.trackId });
			break;
		}
	}
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
		track: trackId,
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

	if (trackId !== undefined) data.track = trackId;
	if (error) data.stage = error.stage;

	sendEvent('player-error', data);
}
