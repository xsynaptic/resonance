import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AudioEngineCallbacks } from '#engine/audio-engine.ts';

import { createAudioEngine, stallAfterMs } from '#engine/audio-engine.ts';

const request = { resumeAtSeconds: 0, src: 'https://api.test/a' };

let isPaused = false;
let media: ReturnType<typeof spyOnMedia>;

// Every engine a test built still listens on the document, so calls count per element
function callsOn(spy: { mock: { contexts: Array<unknown> } }, element: HTMLMediaElement): number {
	return spy.mock.contexts.filter((context) => context === element).length;
}

function createCallbacks(): AudioEngineCallbacks {
	return {
		isPaused: () => isPaused,
		onDiagnostic: vi.fn(),
		onDuration: vi.fn(),
		onEnded: vi.fn(),
		onError: vi.fn(),
		onStatus: vi.fn(),
		onTime: vi.fn(),
	};
}

function showPageAfter(elapsedMs: number): void {
	const now = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + elapsedMs);

	document.dispatchEvent(new Event('visibilitychange'));
	now.mockRestore();
}

function spyOnMedia() {
	return {
		load: vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(vi.fn()),
		pause: vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(vi.fn()),
		play: vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(),
	};
}

beforeEach(() => {
	isPaused = false;
	media = spyOnMedia();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('audio engine', () => {
	// The browser rejects the pending promise itself when a pause lands on it
	test('a pause during the element play leaves it paused and reports no failure', async () => {
		const callbacks = createCallbacks();
		const pendingPlay = Promise.withResolvers<undefined>();

		media.play.mockReturnValue(pendingPlay.promise);
		media.pause.mockImplementation(() => {
			pendingPlay.reject(new DOMException('Interrupted by a call to pause()', 'AbortError'));
		});

		const engine = createAudioEngine(callbacks);
		const loaded = engine.load(request);

		await vi.waitFor(() => {
			expect(media.play).toHaveBeenCalledOnce();
		});

		isPaused = true;
		engine.pause();
		await loaded;

		expect(callbacks.onError).not.toHaveBeenCalled();
		expect(media.play).toHaveBeenCalledOnce();
		expect(media.pause.mock.invocationCallOrder[0]).toBeGreaterThan(
			media.play.mock.invocationCallOrder[0] ?? Infinity,
		);
	});

	test('an autoplay refusal reports a pause rather than a failure', async () => {
		const callbacks = createCallbacks();

		media.play.mockRejectedValue(new DOMException('Refused', 'NotAllowedError'));

		await createAudioEngine(callbacks).load(request);

		expect(callbacks.onError).not.toHaveBeenCalled();
		expect(callbacks.onStatus).toHaveBeenLastCalledWith('paused');
	});

	test('a failed source reports no play rejection', async () => {
		const callbacks = createCallbacks();

		media.play.mockRejectedValue(new DOMException('No supported source', 'NotSupportedError'));

		await createAudioEngine(callbacks).load(request);

		expect(callbacks.onDiagnostic).not.toHaveBeenCalled();
	});

	// A reset's own pause never arrives, since its `load()` drops the queued event
	test('the first pause after a reset of a playing element is reported', () => {
		vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);

		const callbacks = createCallbacks();
		const engine = createAudioEngine(callbacks);

		engine.reset();

		const [element] = media.pause.mock.contexts as Array<HTMLMediaElement>;

		element?.dispatchEvent(new Event('pause'));
		expect(callbacks.onStatus).toHaveBeenCalledWith('paused');
	});

	// Loading resets the element's clock to zero, which is not where the load is headed
	test('holds the clock back while a resume offset waits on metadata', () => {
		const callbacks = createCallbacks();

		void createAudioEngine(callbacks).load({ ...request, resumeAtSeconds: 600 });

		const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

		element?.dispatchEvent(new Event('timeupdate'));
		expect(callbacks.onTime).not.toHaveBeenCalled();

		element?.dispatchEvent(new Event('loadedmetadata'));
		element?.dispatchEvent(new Event('timeupdate'));
		expect(callbacks.onTime).toHaveBeenCalled();
	});

	test('a stream without a finite length reports no duration over the queue one', () => {
		const callbacks = createCallbacks();

		void createAudioEngine(callbacks).load(request);

		const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

		element?.dispatchEvent(new Event('loadedmetadata'));
		expect(callbacks.onDuration).not.toHaveBeenCalled();
	});

	describe('stall watchdog', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		test('reports a load that never plays once, however often it waits again', async () => {
			const callbacks = createCallbacks();

			await createAudioEngine(callbacks).load(request);

			const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

			vi.advanceTimersByTime(19_999);
			expect(callbacks.onDiagnostic).not.toHaveBeenCalled();

			vi.advanceTimersByTime(1);
			element?.dispatchEvent(new Event('waiting'));
			vi.advanceTimersByTime(40_000);

			expect(callbacks.onDiagnostic).toHaveBeenCalledOnce();
			expect(callbacks.onDiagnostic).toHaveBeenCalledWith(
				expect.objectContaining({ hasPlayed: false, kind: 'stall' }),
			);
		});

		test('stays quiet when playback starts first', async () => {
			const callbacks = createCallbacks();

			await createAudioEngine(callbacks).load(request);

			const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

			vi.advanceTimersByTime(10_000);
			element?.dispatchEvent(new Event('playing'));
			vi.advanceTimersByTime(40_000);

			expect(callbacks.onDiagnostic).not.toHaveBeenCalled();
		});
	});

	describe('a starved load on return to the page', () => {
		test('starts again once the stall threshold has passed, and not again straight after', async () => {
			const engine = createAudioEngine(createCallbacks());

			await engine.load(request);
			showPageAfter(stallAfterMs);
			showPageAfter(stallAfterMs);

			expect(callsOn(media.load, engine.element)).toBe(2);
			expect(callsOn(media.play, engine.element)).toBe(2);
			expect(engine.element.getAttribute('src')).toBe(request.src);
		});

		test('is left alone before the stall threshold', async () => {
			const engine = createAudioEngine(createCallbacks());

			await engine.load(request);
			showPageAfter(stallAfterMs / 2);

			expect(callsOn(media.load, engine.element)).toBe(1);
		});

		test('is left alone once the element holds anything', async () => {
			const engine = createAudioEngine(createCallbacks());

			await engine.load(request);
			vi.spyOn(engine.element, 'readyState', 'get').mockReturnValue(1);
			showPageAfter(stallAfterMs);

			expect(callsOn(media.load, engine.element)).toBe(1);
		});

		test('is left alone after a pause', async () => {
			const engine = createAudioEngine(createCallbacks());

			await engine.load(request);
			isPaused = true;
			showPageAfter(stallAfterMs);

			expect(callsOn(media.load, engine.element)).toBe(1);
		});

		test('is left alone after an unload', async () => {
			const engine = createAudioEngine(createCallbacks());

			await engine.load(request);
			engine.reset();
			showPageAfter(stallAfterMs);

			expect(callsOn(media.load, engine.element)).toBe(2);
		});
	});

	test('unloading drops the source so the old track stops downloading', () => {
		const engine = createAudioEngine(createCallbacks());

		void engine.load(request);
		engine.reset();

		const [element] = media.load.mock.contexts as Array<HTMLMediaElement>;

		expect(element?.hasAttribute('src')).toBe(false);
		expect(media.pause).toHaveBeenCalled();
	});
});
