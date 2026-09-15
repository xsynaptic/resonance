import '@testing-library/jest-dom/vitest';
import type { StoreApi } from 'zustand/vanilla';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';

import { VolumeControl } from '#components/volume-control.tsx';
import { PlayerStoreProvider } from '#store/context.tsx';
import { createPlayerStore } from '#store/player-store.ts';

const labels = { mute: 'Mute', unmute: 'Unmute', volume: 'Volume' };

function control(): HTMLElement {
	const root = document.querySelector<HTMLElement>('.player-volume');
	if (!root) throw new Error('The control rendered no root');

	return root;
}

// The hook reads the pointer once on mount, so the query has to answer before the control renders
function renderControl(hover: 'hover' | 'none'): StoreApi<PlayerStore> {
	vi.stubGlobal('matchMedia', (query: string) => ({
		addEventListener: vi.fn(),
		matches: query.includes(`hover: ${hover}`),
		removeEventListener: vi.fn(),
	}));

	const store = createPlayerStore();

	render(
		<PlayerStoreProvider store={store}>
			<VolumeControl labels={labels} />
		</PlayerStoreProvider>,
	);

	return store;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('VolumeControl', () => {
	test('mutes on a click where the panel already opens on hover', () => {
		const store = renderControl('hover');

		fireEvent.click(screen.getByRole('button', { name: labels.mute }));

		expect(store.getState().volume).toBe(0);
		expect(control()).not.toHaveAttribute('data-open');
		expect(screen.getByRole('button', { name: labels.unmute })).not.toHaveAttribute(
			'aria-expanded',
		);
	});

	test('opens the panel on a click where the pointer cannot hover', () => {
		const store = renderControl('none');

		const trigger = screen.getByRole('button', { name: labels.volume });

		expect(trigger).toHaveAttribute('aria-expanded', 'false');

		fireEvent.click(trigger);

		expect(control()).toHaveAttribute('data-open', '');
		expect(trigger).toHaveAttribute('aria-expanded', 'true');
		expect(store.getState().volume).toBe(1);
	});

	test('moves mute into the panel where the trigger opens it instead', () => {
		renderControl('none');

		expect(screen.getByRole('button', { name: labels.volume })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: labels.mute })).toBeInTheDocument();
	});

	test('leaves the panel to the slider alone where the trigger mutes', () => {
		renderControl('hover');

		expect(screen.getAllByRole('button')).toHaveLength(1);
	});

	test('closes on Escape and hands focus back to the trigger', () => {
		renderControl('none');

		const trigger = screen.getByRole('button', { name: labels.volume });

		fireEvent.click(trigger);
		fireEvent.keyDown(screen.getByRole('slider', { name: labels.volume }), { key: 'Escape' });

		expect(control()).not.toHaveAttribute('data-open');
		expect(trigger).toHaveFocus();
	});

	test('closes on a click outside the control and not on one inside it', () => {
		renderControl('none');

		fireEvent.click(screen.getByRole('button', { name: labels.volume }));
		fireEvent.click(screen.getByRole('slider', { name: labels.volume }));

		expect(control()).toHaveAttribute('data-open', '');

		fireEvent.click(document.body);

		expect(control()).not.toHaveAttribute('data-open');
	});

	test('reports a drag to the store', () => {
		const store = renderControl('hover');

		fireEvent.change(screen.getByRole('slider', { name: labels.volume }), {
			target: { value: '0.4' },
		});

		expect(store.getState().volume).toBe(0.4);
	});

	test('names the level as a percentage rather than a fraction', () => {
		const store = renderControl('hover');

		act(() => {
			store.getState().setVolume(0.37);
		});

		expect(screen.getByRole('slider', { name: labels.volume })).toHaveAttribute(
			'aria-valuetext',
			'37%',
		);
	});
});
