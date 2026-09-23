import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

// happy-dom does no layout, so the strip is given a 400px box to press on
function mountStrip(options: { currentTimeSeconds: number; durationSeconds: number }) {
	vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(
		DOMRect.fromRect({ height: 10, width: 400 }),
	);

	const mounted = mount('player-progress');

	mounted.store.getState().playTrack([queueItem('a')], 'a');
	mounted.fake.callbacks.current?.onDuration(options.durationSeconds);
	mounted.fake.callbacks.current?.onTime(options.currentTimeSeconds);

	return {
		...mounted,
		seeks: () => mounted.fake.engine.seek.mock.calls.map(([seconds]) => seconds),
		slider: getByRole(mounted.part, 'slider', { name: labels.seek }),
	};
}

function progressOf(part: HTMLElement): string {
	return (
		part
			.querySelector<HTMLElement>('.player-progress-track')
			?.style.getPropertyValue('--player-progress') ?? ''
	);
}

describe('<player-progress>', () => {
	test('follows the position as a share of the duration, and reads nothing before either is known', () => {
		const { fake, part, store } = mount('player-progress');

		expect(progressOf(part)).toBe('0');

		store.getState().playTrack([queueItem('a')], 'a');
		fake.callbacks.current?.onTime(45);

		expect(progressOf(part)).toBe('0');

		fake.callbacks.current?.onDuration(180);

		expect(progressOf(part)).toBe('0.25');

		store.getState().clearQueue();

		expect(progressOf(part)).toBe('0');
	});

	test('is no slider and no tab stop until a duration is known', () => {
		const { fake, part, store } = mount('player-progress');
		const strip = part.querySelector('.player-progress');

		store.getState().playTrack([queueItem('a')], 'a');

		expect(queryByRole(part, 'slider')).toBeNull();
		expect(strip?.hasAttribute('tabindex')).toBe(false);

		fake.callbacks.current?.onDuration(180);

		expect(getByRole(part, 'slider', { name: labels.seek }).getAttribute('tabindex')).toBe('0');

		store.getState().clearQueue();

		expect(queryByRole(part, 'slider')).toBeNull();
		expect(strip?.hasAttribute('tabindex')).toBe(false);
	});

	test('seeks a click at a quarter of the strip to a quarter of the track', () => {
		const { seeks, slider } = mountStrip({ currentTimeSeconds: 0, durationSeconds: 180 });

		fireEvent.pointerDown(slider, { clientX: 100 });

		expect(seeks()).toStrictEqual([]);

		fireEvent.pointerUp(slider, { clientX: 100 });

		expect(seeks()).toStrictEqual([45]);
	});

	test('seeks a drag where it is released', () => {
		const { seeks, slider } = mountStrip({ currentTimeSeconds: 0, durationSeconds: 180 });

		fireEvent.pointerDown(slider, { clientX: 100 });
		fireEvent.pointerMove(slider, { clientX: 300 });

		expect(slider.dataset.scrubbing).toBeDefined();

		fireEvent.pointerUp(slider, { clientX: 300 });

		expect(seeks()).toStrictEqual([135]);
		expect(slider.dataset.scrubbing).toBeUndefined();
	});

	test('drops a drag the browser cancels, or one the strip loses focus during, without seeking', () => {
		const { seeks, slider } = mountStrip({ currentTimeSeconds: 0, durationSeconds: 180 });

		fireEvent.pointerDown(slider, { clientX: 100 });
		fireEvent.pointerMove(slider, { clientX: 300 });
		fireEvent.pointerCancel(slider);

		expect(slider.dataset.scrubbing).toBeUndefined();

		fireEvent.pointerDown(slider, { clientX: 100 });
		fireEvent.blur(slider);
		fireEvent.pointerUp(slider, { clientX: 100 });

		expect(seeks()).toStrictEqual([]);
	});

	test('ignores a pointer that moves across it without a press', () => {
		const { seeks, slider } = mountStrip({ currentTimeSeconds: 0, durationSeconds: 180 });

		fireEvent.pointerMove(slider, { clientX: 300 });
		fireEvent.pointerUp(slider, { clientX: 300 });

		expect(seeks()).toStrictEqual([]);
		expect(slider.dataset.scrubbing).toBeUndefined();
	});

	// Each seek moves the store's position, so the next key steps from where the last one landed
	test('seeks on the slider keys and leaves anything else to the page', () => {
		const { seeks, slider } = mountStrip({ currentTimeSeconds: 50, durationSeconds: 200 });

		for (const key of ['ArrowRight', 'ArrowLeft', 'PageUp', 'Home', 'End', 'Enter']) {
			fireEvent.keyDown(slider, { key });
		}

		expect(seeks()).toStrictEqual([55, 50, 110, 0, 200]);
	});

	test('scrubs while a key repeats and seeks once when it is released', () => {
		const { seeks, slider } = mountStrip({ currentTimeSeconds: 50, durationSeconds: 200 });

		fireEvent.keyDown(slider, { key: 'ArrowRight' });
		fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true });
		fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true });

		expect(seeks()).toStrictEqual([55]);
		expect(slider.getAttribute('aria-valuenow')).toBe('65');

		fireEvent.keyUp(slider, { key: 'ArrowRight' });

		expect(seeks()).toStrictEqual([55, 65]);
	});

	test('speaks the position against the duration as it moves', () => {
		const { fake, slider } = mountStrip({ currentTimeSeconds: 0, durationSeconds: 180 });

		fake.callbacks.current?.onTime(45.6);

		expect(slider.getAttribute('aria-valuemax')).toBe('180');
		expect(slider.getAttribute('aria-valuenow')).toBe('45');
		expect(slider.getAttribute('aria-valuetext')).toBe('45 seconds of 3 minutes');
	});
});
