import { afterEach, describe, expect, test, vi } from 'vitest';

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
