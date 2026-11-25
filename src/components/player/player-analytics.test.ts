// @vitest-environment happy-dom
import type { PlayerPress } from '@xsynaptic/plazmoid-core';

import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

const analytics = vi.hoisted(() => ({ sendEvent: vi.fn() }));

vi.mock('#lib/analytics/analytics-events.ts', () => analytics);

let trackControlPress: (press: PlayerPress) => void;

// The module reads DEV once on import, so the stub has to land first or every press is suppressed
beforeAll(async () => {
	vi.stubEnv('DEV', false);
	({ trackControlPress } = await import('#components/player/player-analytics.ts'));
	vi.unstubAllEnvs();
});

beforeEach(() => {
	analytics.sendEvent.mockClear();
});

test('each part that opens reaches its own event, the tray included', () => {
	for (const part of ['overlay', 'panel', 'tray'] as const) {
		trackControlPress({ action: 'open', part });
	}

	expect(analytics.sendEvent.mock.calls).toStrictEqual([
		['player-overlay-open'],
		['player-panel-open'],
		['player-tray-open'],
	]);
});

test('Clear on an empty Queue sends nothing, since nothing was cleared', () => {
	trackControlPress({ action: 'clear', origin: 'tray', trackCount: 0 });

	expect(analytics.sendEvent).not.toHaveBeenCalled();

	trackControlPress({ action: 'clear', origin: 'tray', trackCount: 3 });

	expect(analytics.sendEvent).toHaveBeenCalledExactlyOnceWith('player-queue-clear', {
		origin: 'tray',
		trackCount: 3,
	});
});

test('a playlist play reports the Mix it started on, not its first, and never as a resume', () => {
	trackControlPress({ action: 'play-tracks', origin: 'page', trackId: 'b', trackIds: ['a', 'b'] });

	expect(analytics.sendEvent).toHaveBeenCalledExactlyOnceWith(
		'player-play',
		expect.objectContaining({ isResume: false, origin: 'page', track: 'b' }),
	);
});

test('queueing a group is one add naming its first Mix and the count, where it used to send nothing', () => {
	trackControlPress({ action: 'queue-tracks', origin: 'page', trackIds: ['a', 'b', 'c'] });

	expect(analytics.sendEvent).toHaveBeenCalledExactlyOnceWith('player-queue-add', {
		origin: 'page',
		track: 'a',
		trackCount: 3,
	});
});
