import { afterEach, describe, expect, test, vi } from 'vitest';

import { mount, queueItem } from '#test/mount.ts';

function mountPlaying() {
	const mounted = mount('player-scope');

	mounted.store.getState().playTrack([queueItem('a')], 'a');

	return mounted;
}

// happy-dom draws nothing and lays nothing out, so the canvas, its width and the frame clock are the test's
function stubCanvas(width: number) {
	const context = {
		beginPath: vi.fn(),
		clearRect: vi.fn(),
		lineTo: vi.fn(),
		moveTo: vi.fn(),
		setTransform: vi.fn(),
		stroke: vi.fn(),
	};
	const frames: Array<FrameRequestCallback> = [];
	const cancelFrame = vi.fn();

	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
		context as unknown as CanvasRenderingContext2D,
	);
	Object.defineProperties(HTMLCanvasElement.prototype, {
		clientHeight: { configurable: true, value: 32 },
		clientWidth: { configurable: true, value: width },
	});
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		frames.push(callback);

		return frames.length;
	});
	vi.stubGlobal('cancelAnimationFrame', cancelFrame);

	return { cancelFrame, context, frames };
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	for (const property of ['clientHeight', 'clientWidth']) {
		Reflect.deleteProperty(HTMLCanvasElement.prototype, property);
	}
});

describe('<player-scope>', () => {
	test('traces only while playing, and cancels its frame once paused', () => {
		const { cancelFrame, context, frames } = stubCanvas(96);
		const { fake } = mountPlaying();

		expect(frames).toHaveLength(0);

		fake.callbacks.current?.onStatus('playing');

		expect(frames).toHaveLength(1);

		frames[0]?.(0);

		expect(context.stroke).toHaveBeenCalled();

		fake.callbacks.current?.onStatus('paused');

		expect(cancelFrame).toHaveBeenLastCalledWith(frames.length);
	});

	test('requests no frame while it has no width', () => {
		const { frames } = stubCanvas(0);
		const { fake } = mountPlaying();

		fake.callbacks.current?.onStatus('playing');

		expect(frames).toHaveLength(0);
	});
});
