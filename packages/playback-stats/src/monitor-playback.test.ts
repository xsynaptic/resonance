import { fc, test } from '@fast-check/vitest';
import { afterEach, describe, expect, vi } from 'vitest';

import type { PlaybackOptions, PlaybackReport } from '#monitor-playback.ts';

import { monitorPlayback } from '#monitor-playback.ts';

interface MediaFields {
	currentTime: number;
	paused: boolean;
	seeking: boolean;
}

let unbind: (() => void) | undefined;

afterEach(() => {
	unbind?.();
	unbind = undefined;
	vi.restoreAllMocks();
});

function createPage(overrides: Partial<PlaybackOptions> = {}) {
	const media = Object.assign(new EventTarget(), {
		currentTime: 0,
		paused: true,
		seeking: false,
	});
	const reports: Array<PlaybackReport> = [];

	function emit(type: string, fields: Partial<MediaFields> = {}): void {
		Object.assign(media, fields);
		media.dispatchEvent(new Event(type));
	}

	// One second per step, well inside the cap on a single step
	function hear(seconds: number): void {
		for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
			emit('timeupdate', { currentTime: media.currentTime + 1 });
		}
	}

	function bind(): void {
		unbind = monitorPlayback(media, {
			identify: () => 'voyager',
			onReport: (report) => {
				reports.push(report);
			},
			...overrides,
		});
	}

	return { bind, emit, hear, media, reports };
}

describe('monitorPlayback', () => {
	test('reports the running total once every five minutes of heard time', () => {
		const page = createPage();

		page.bind();
		page.emit('playing', { paused: false });

		for (let position = 0.25; position <= 310; position += 0.25) {
			page.emit('timeupdate', { currentTime: position });
		}

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([300]);
	});

	test('a flagged seek adds nothing', () => {
		const page = createPage();

		page.bind();
		page.emit('playing', { paused: false });
		page.hear(40);
		page.emit('seeking', { seeking: true });
		page.emit('timeupdate', { currentTime: 640 });
		page.emit('seeked', { currentTime: 640, seeking: false });
		page.emit('pause', { paused: true });

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([40]);
	});

	test('a seek shorter than the step cap adds nothing when no timeupdate resyncs it', () => {
		const page = createPage();

		page.bind();
		page.emit('playing', { paused: false });
		page.hear(40);
		page.emit('seeking', { currentTime: 41.5, seeking: true });
		page.emit('timeupdate', { seeking: false });
		page.emit('seeked');
		page.emit('timeupdate', { currentTime: 41.7 });
		page.emit('pause', { paused: true });

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([40]);
	});

	test('an unflagged jump adds nothing, forward or back', () => {
		const page = createPage();

		page.bind();
		page.emit('playing', { paused: false });
		page.hear(40);
		page.emit('timeupdate', { currentTime: 640 });
		page.emit('timeupdate', { currentTime: 610 });
		page.emit('pause', { paused: true });

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([40]);
	});

	test('a pause reports the running total, and a second pause adds nothing', () => {
		const page = createPage();

		page.bind();
		page.emit('playing', { paused: false });
		page.hear(45);
		page.emit('pause', { paused: true });
		page.emit('pause');

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([45]);
	});

	test('nothing is reported below the minimum', () => {
		const page = createPage({ minimumSeconds: 30 });

		page.bind();
		page.emit('playing', { paused: false });
		page.hear(20);
		page.emit('pause', { paused: true });

		expect(page.reports).toHaveLength(0);

		page.emit('playing', { paused: false });
		page.hear(15);
		page.emit('pause', { paused: true });

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([35]);
	});

	test('a playback the identify hook declines is never reported', () => {
		let itemId: string | undefined = 'voyager';
		const page = createPage({ identify: () => itemId });

		page.bind();
		page.emit('playing', { paused: false });
		page.hear(40);
		page.emit('pause', { paused: true });
		page.emit('emptied');

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([40]);

		itemId = undefined;
		page.emit('playing', { paused: false });
		page.hear(60);
		page.emit('pause', { paused: true });

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([40]);
	});

	test('emptied closes the listen, and the next play opens another', () => {
		let itemId = 'voyager';
		const page = createPage({ identify: () => itemId });

		page.bind();
		page.emit('playing', { paused: false });
		page.hear(40);
		page.emit('pause', { paused: true });
		page.emit('emptied');

		itemId = 'uroboros';
		page.emit('playing', { paused: false });
		page.hear(50);
		page.emit('pause', { paused: true });

		const [first, second] = page.reports;

		expect(first?.itemId).toBe('voyager');
		expect(second?.itemId).toBe('uroboros');
		expect(second?.heardSeconds).toBe(50);
		expect(second?.listenId).not.toBe(first?.listenId);
	});

	test('ended closes the listen too', () => {
		const page = createPage();

		page.bind();
		page.emit('playing', { paused: false });
		page.hear(40);
		page.emit('ended', { paused: true });
		page.emit('playing', { paused: false });
		page.hear(40);
		page.emit('pause', { paused: true });

		const [first, second] = page.reports;

		expect(page.reports).toHaveLength(2);
		expect(second?.listenId).not.toBe(first?.listenId);
	});

	test('binding to media already playing accrues without a playing event', () => {
		const page = createPage();

		page.media.paused = false;
		page.bind();
		page.hear(40);
		page.emit('pause', { paused: true });

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([40]);
	});

	test('a hidden page reports, and unbinding reports once and then stops', () => {
		const page = createPage();

		page.bind();
		page.emit('playing', { paused: false });
		page.hear(40);
		vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		document.dispatchEvent(new Event('visibilitychange'));

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([40]);

		page.hear(20);
		unbind?.();
		unbind = undefined;

		expect(page.reports.map((report) => report.heardSeconds)).toEqual([40, 60]);

		page.hear(30);
		page.emit('pause', { paused: true });

		expect(page.reports).toHaveLength(2);
	});
});

interface EngineStep {
	isPositionLate: boolean;
	isTabHidden: boolean;
	kind: 'end' | 'hide' | 'jump' | 'pause' | 'play' | 'seek' | 'switch' | 'tick';
	quarters: number;
}

interface HeardReport extends PlaybackReport {
	heardBySimulator: number | undefined;
	session: number | undefined;
}

interface Checkpoint {
	heard: number;
	reportsSent: number;
	session: number;
}

interface SimulatedPlayback extends Pick<PlaybackOptions, 'minimumSeconds' | 'reportEverySeconds'> {
	isPlayingAtBind: boolean;
	steps: Array<EngineStep>;
}

function engineStep(kind: EngineStep['kind'], quarters: fc.Arbitrary<number>, weight: number) {
	return {
		arbitrary: fc.record({
			isPositionLate: fc.boolean(),
			isTabHidden: fc.boolean(),
			kind: fc.constant(kind),
			quarters,
		}),
		weight,
	};
}

const noQuarters = fc.constant(0);

const tickQuarters = fc.integer({ max: 8, min: 1 });
const seekQuarters = fc.integer({ max: 12, min: -12 });
const jumpQuarters = fc.oneof(fc.integer({ max: -1, min: -12 }), fc.integer({ max: 16, min: 9 }));

// Steps are whole quarter seconds because those add up exactly in floating point, so totals can be compared with `toBe`
// Seeks and jumps stay within a few seconds of the playhead, the range where one could pass for playback
// A jump moves the clock back, or forward past the two-second cap, without a seek; nobody heard it, so the simulator doesn't count it
const engineSteps = fc.array(
	fc.oneof(
		engineStep('tick', tickQuarters, 8),
		engineStep('end', noQuarters, 1),
		engineStep('hide', noQuarters, 1),
		engineStep('pause', noQuarters, 1),
		engineStep('play', noQuarters, 1),
		engineStep('switch', noQuarters, 1),
		engineStep('seek', seekQuarters, 3),
		engineStep('jump', jumpQuarters, 2),
	),
	{ maxLength: 60, size: 'max' },
);

const engineOrderedPlayback = fc.record({
	isPlayingAtBind: fc.boolean(),
	minimumSeconds: fc.constantFrom(0, 3),
	reportEverySeconds: fc.constantFrom(2, 300),
	steps: engineSteps,
});

// Events fire in the order browsers use: a seek clears `seeking` before its `timeupdate` and `seeked`
// `isPositionLate` covers engines where the new position only shows up in a `timeupdate` fired mid-seek
// Playback ends with a pause; a track switch fires `emptied` and no pause, because `load()` discards the one `reset()` queued
// `load()` also fires a `timeupdate` when it resets a nonzero position to 0
function simulateEngine({ isPlayingAtBind, steps, ...options }: SimulatedPlayback) {
	const media = Object.assign(new EventTarget(), {
		currentTime: 0,
		paused: !isPlayingAtBind,
		seeking: false,
	});
	const heardBySession: Array<number> = isPlayingAtBind ? [0] : [];
	const checkpoints: Array<Checkpoint> = [];
	const reports: Array<HeardReport> = [];
	let session: number | undefined = isPlayingAtBind ? 0 : undefined;
	let hasEnded = false;

	function emit(type: string, fields: Partial<MediaFields> = {}): void {
		Object.assign(media, fields);
		media.dispatchEvent(new Event(type));
	}

	function checkpoint(): void {
		if (session === undefined) return;

		checkpoints.push({ heard: heardBySession[session] ?? 0, reportsSent: reports.length, session });
	}

	function seek(seconds: number, isPositionLate: boolean): void {
		if (isPositionLate) {
			emit('seeking', { seeking: true });
			emit('timeupdate', { currentTime: seconds });
		} else {
			emit('seeking', { currentTime: seconds, seeking: true });
		}

		emit('timeupdate', { seeking: false });
		emit('seeked');
		hasEnded = false;
	}

	function hide(isTabHidden: boolean): void {
		if (isTabHidden) {
			const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

			document.dispatchEvent(new Event('visibilitychange'));
			visibility.mockRestore();
		} else {
			window.dispatchEvent(new Event('pagehide'));
		}

		checkpoint();
	}

	function play(): void {
		if (!media.paused) return;
		if (hasEnded) seek(0, false);

		if (session === undefined) {
			session = heardBySession.length;
			heardBySession.push(0);
		}

		emit('playing', { paused: false });
	}

	const engine: Record<EngineStep['kind'], (step: EngineStep) => void> = {
		end: () => {
			if (media.paused) return;

			emit('pause', { paused: true });
			emit('ended');
			checkpoint();
			hasEnded = true;
			session = undefined;
		},
		hide: (step) => {
			hide(step.isTabHidden);
		},
		jump: (step) => {
			if (media.paused) return;

			emit('timeupdate', { currentTime: Math.max(0, media.currentTime + step.quarters / 4) });
		},
		pause: () => {
			if (media.paused) return;

			emit('pause', { paused: true });
			checkpoint();
		},
		play,
		seek: (step) => {
			seek(Math.max(0, media.currentTime + step.quarters / 4), step.isPositionLate);
		},
		switch: () => {
			emit('emptied', { paused: true });
			if (media.currentTime !== 0) emit('timeupdate', { currentTime: 0 });
			checkpoint();
			hasEnded = false;
			session = undefined;
		},
		tick: (step) => {
			if (session === undefined || media.paused) return;

			heardBySession[session] = (heardBySession[session] ?? 0) + step.quarters / 4;
			emit('timeupdate', { currentTime: media.currentTime + step.quarters / 4 });
		},
	};

	const stopMonitoring = monitorPlayback(media, {
		...options,
		identify: () => 'voyager',
		onReport: (report) => {
			reports.push({
				...report,
				heardBySimulator: session === undefined ? undefined : heardBySession[session],
				session,
			});
		},
	});

	for (const step of steps) engine[step.kind](step);

	stopMonitoring();
	checkpoint();

	return { checkpoints, reports };
}

describe('monitorPlayback over any engine-ordered playback', () => {
	test.prop([engineOrderedPlayback])(
		'a listen reports only whole seconds heard, and has sent them all by every pause, hide, end or switch',
		(playback) => {
			const { checkpoints, reports } = simulateEngine(playback);
			const { minimumSeconds } = playback;
			const sessionByListen = new Map<string, number | undefined>();

			for (const report of reports) {
				expect(report.heardSeconds).toBe(Math.floor(report.heardBySimulator ?? NaN));
				expect(report.heardSeconds).toBeGreaterThanOrEqual(minimumSeconds);
				expect(sessionByListen.get(report.listenId) ?? report.session).toBe(report.session);

				sessionByListen.set(report.listenId, report.session);
			}

			expect(new Set(sessionByListen.values()).size).toBe(sessionByListen.size);

			for (const { heard, reportsSent, session } of checkpoints) {
				const sent = reports.slice(0, reportsSent).findLast((report) => report.session === session);
				const isReportable = Math.floor(heard) >= Math.max(1, minimumSeconds);

				expect(sent?.heardSeconds).toBe(isReportable ? Math.floor(heard) : undefined);
			}
		},
	);
});
