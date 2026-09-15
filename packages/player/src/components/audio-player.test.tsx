import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayerUrls, QueueItem } from '#types.ts';

import { AudioPlayer } from '#components/audio-player.tsx';
import * as Player from '#components/parts.ts';
import { labels } from '#components/test-labels.ts';
import { createFakeEngine } from '#engine/fake-engine.ts';
import { createPlayerStore } from '#store/player-store.ts';

const testUrls: PlayerUrls = {
	stream: ({ trackId }) =>
		Promise.resolve({ status: 'ok', url: `https://api.test/tracks/${trackId}/stream` }),
};

function makeItem(id: string, extra: Partial<QueueItem> = {}): QueueItem {
	return {
		albumLoudness: {},
		artistLine: 'Nebula Drift',
		durationMs: 180_000,
		loudness: {},
		releaseTitle: 'Cosmic Drift',
		title: `Track ${id}`,
		trackId: id,
		...extra,
	};
}

const releaseHref = '/releases/cosmic-drift';
const release = [makeItem('a', { releaseHref }), makeItem('b', { releaseHref })];

const artwork = [
	{ src: '/artwork-120.webp', width: 120 },
	{ src: '/artwork-240.webp', width: 240 },
];

function preventNavigation(event: MouseEvent): void {
	event.preventDefault();
}

let fake = createFakeEngine();

function renderPlayer() {
	const store = createPlayerStore({ createEngine: fake.createEngine });

	render(<AudioPlayer labels={labels} store={store} urls={testUrls} />);

	return store;
}

beforeEach(() => {
	fake = createFakeEngine();
});

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe('AudioPlayer', () => {
	test('disables transport and shows the placeholder with an empty queue', () => {
		renderPlayer();

		expect(screen.getByRole('button', { name: labels.play })).toBeDisabled();
		expect(screen.getByText(labels.nowPlaying)).toBeInTheDocument();
	});

	test('keeps focus on next once its own press leaves nothing after the current track', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});

		const next = screen.getByRole('button', { name: labels.next });

		next.focus();
		fireEvent.click(next);

		expect(store.getState().currentIndex).toBe(1);
		expect(next).toHaveAttribute('aria-disabled', 'true');
		expect(next).toHaveFocus();

		fireEvent.click(next);

		expect(store.getState().currentIndex).toBe(1);
	});

	test('shows the loaded track and enables transport after a play', async () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});

		expect(screen.getByRole('link', { name: 'Track a' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: labels.pause })).toBeEnabled();

		await waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				gain: 1,
				resumeAtSeconds: 0,
				src: 'https://api.test/tracks/a/stream',
			});
		});
	});

	test('reports transport presses to the store', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});
		fireEvent.click(screen.getByRole('button', { name: labels.next }));

		expect(store.getState().currentIndex).toBe(1);

		act(() => {
			fake.callbacks.current?.onStatus('playing');
		});
		fireEvent.click(screen.getByRole('button', { name: labels.pause }));

		expect(fake.engine.pause).toHaveBeenCalled();
	});

	test('the play button follows intent and marks a load toward playback', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});

		const button = screen.getByRole('button', { name: labels.pause });

		expect(button).toHaveAttribute('data-loading');

		act(() => {
			store.getState().pause();
		});

		expect(screen.getByRole('button', { name: labels.play })).not.toHaveAttribute('data-loading');

		act(() => {
			fake.callbacks.current?.onStatus('loading');
		});

		expect(screen.getByRole('button', { name: labels.play })).not.toHaveAttribute('data-loading');
	});

	test('opens the queue tray and jumps to a track', async () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});
		fireEvent.click(screen.getByRole('button', { name: labels.queue }));
		fireEvent.click(await screen.findByRole('button', { name: /Track b/ }));

		expect(store.getState().currentIndex).toBe(1);
	});

	test('closes the queue tray on a click outside it and on Escape', async () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue(release);
		});

		const trigger = screen.getByRole('button', { name: labels.queue });

		fireEvent.click(trigger);
		fireEvent.pointerDown(document.body);

		expect(store.getState().isTrayOpen).toBe(true);

		fireEvent.click(document.body);

		expect(store.getState().isTrayOpen).toBe(false);

		fireEvent.click(trigger);
		fireEvent.keyDown(await screen.findByRole('button', { name: /Track b/ }), { key: 'Escape' });

		expect(store.getState().isTrayOpen).toBe(false);
		expect(trigger).toHaveFocus();
	});

	test('draws a heading over each section of the queue and drops shuffle', () => {
		const store = renderPlayer();

		act(() => {
			store
				.getState()
				.loadQueue([
					makeItem('a', { sectionLabel: 'Darkpsy' }),
					makeItem('b'),
					makeItem('c', { sectionLabel: 'Forest' }),
				]);
		});
		fireEvent.click(screen.getByRole('button', { name: labels.queue }));

		expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
			'Darkpsy',
			expect.stringContaining('Track a'),
			expect.stringContaining('Track b'),
			'Forest',
			expect.stringContaining('Track c'),
		]);
		expect(screen.queryByRole('button', { name: labels.shuffle })).not.toBeInTheDocument();
	});

	test('offers shuffle on an ordinary queue', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue(release);
		});
		fireEvent.click(screen.getByRole('button', { name: labels.queue }));

		expect(screen.getByRole('button', { name: labels.shuffle })).toBeInTheDocument();
	});

	test('renders the title as text when the host names no release destination', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack([makeItem('a')], 'a');
		});

		expect(screen.queryByRole('link', { name: 'Track a' })).not.toBeInTheDocument();
		expect(screen.getByText('Track a')).toBeVisible();
	});

	test('lists the artwork renditions and collapses the image once it fails to load', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue([makeItem('a', { artwork })]);
		});

		const image = document.querySelector('.player-artwork');
		if (!image) throw new Error('The bar rendered no artwork');

		expect(image).toHaveAttribute('srcset', '/artwork-120.webp 120w, /artwork-240.webp 240w');

		fireEvent.error(image);

		expect(document.querySelector('.player-artwork')).not.toBeInTheDocument();
	});

	test('renders no artwork where the host switches it off', () => {
		const store = createPlayerStore({ createEngine: fake.createEngine });

		render(<AudioPlayer isArtworkEnabled={false} labels={labels} store={store} urls={testUrls} />);
		act(() => {
			store.getState().loadQueue([makeItem('a', { artwork })]);
		});

		expect(document.querySelector('.player-artwork')).not.toBeInTheDocument();
	});

	test('renders the seek buttons only when the host names an interval', () => {
		renderPlayer();

		expect(screen.queryByRole('button', { name: labels.seekBack })).not.toBeInTheDocument();

		cleanup();

		const store = createPlayerStore({ createEngine: fake.createEngine });

		render(<AudioPlayer labels={labels} seekSeconds={30} store={store} urls={testUrls} />);

		act(() => {
			store.getState().playTrack(release, 'a');
			fake.callbacks.current?.onTime(100);
		});
		fireEvent.click(screen.getByRole('button', { name: labels.seekForward }));

		expect(fake.engine.seek).toHaveBeenCalledWith(130);

		fireEvent.click(screen.getByRole('button', { name: labels.seekBack }));

		expect(fake.engine.seek).toHaveBeenCalledWith(100);
	});

	test('seeks in seconds off the range input', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});
		fireEvent.change(screen.getByRole('slider', { name: labels.seek }), {
			target: { value: '42' },
		});

		expect(fake.engine.seek).toHaveBeenCalledWith(42);
	});

	test('swaps the range input for the waveform surface once a track carries peaks', () => {
		const store = renderPlayer();

		expect(screen.getByRole('slider', { name: labels.seek }).tagName).toBe('INPUT');

		act(() => {
			store.getState().playTrack([makeItem('a', { waveformOverview: [0.1, 0.9] })], 'a');
		});

		expect(screen.getByRole('slider', { name: labels.seek }).tagName).toBe('CANVAS');
	});

	test('reports a volume change', () => {
		const store = renderPlayer();

		fireEvent.change(screen.getByRole('slider', { name: labels.volume }), {
			target: { value: '0.5' },
		});

		expect(store.getState().volume).toBe(0.5);
	});

	test('surfaces a failed resolve in the status region', async () => {
		const store = createPlayerStore({ createEngine: fake.createEngine });

		render(
			<AudioPlayer
				labels={labels}
				store={store}
				urls={{ stream: () => Promise.reject(new Error('Offline')) }}
			/>,
		);
		act(() => {
			store.getState().playTrack(release, 'a');
		});

		await waitFor(() => {
			expect(screen.getByRole('status')).toHaveTextContent(labels.error);
		});
	});

	test('flips the clock between elapsed and remaining', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
			fake.callbacks.current?.onTime(64);
		});

		const clock = screen.getByRole('button', { name: labels.toggleTimeMode });

		expect(clock).toHaveTextContent('1:04');

		fireEvent.click(clock);

		expect(clock).toHaveTextContent('-1:56');
		expect(clock).toHaveAttribute('data-mode', 'remaining');
	});

	test('renders what the host composed into the track info beside the artist', () => {
		const store = createPlayerStore({ createEngine: fake.createEngine });

		render(
			<Player.Root store={store} urls={testUrls}>
				<Player.TrackInfo emptyLabel={labels.nowPlaying}>
					<span>Composed in</span>
				</Player.TrackInfo>
			</Player.Root>,
		);

		act(() => {
			store.getState().playTrack(release, 'a');
		});

		expect(screen.getByText('Nebula Drift').closest('.player-track-meta')).toHaveTextContent(
			'Composed in',
		);
	});

	test('expands into the overlay and closes it from its close button and from the dialog', async () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue(release);
		});
		fireEvent.click(screen.getByRole('button', { name: labels.expand }));

		const dialog = screen.getByRole('dialog', { hidden: true });

		expect(dialog).toHaveAttribute('open');

		fireEvent.click(await screen.findByRole('button', { name: labels.close }));

		expect(store.getState().isOverlayOpen).toBe(false);
		expect(dialog).not.toHaveAttribute('open');

		fireEvent.click(screen.getByRole('button', { name: labels.expand }));
		act(() => {
			(dialog as HTMLDialogElement).close();
		});

		expect(store.getState().isOverlayOpen).toBe(false);
	});

	test('closes the overlay once the queue empties', async () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue(release);
			store.getState().toggleOverlay();
		});
		fireEvent.click(await screen.findByRole('button', { name: labels.clearQueue }));

		expect(store.getState().isOverlayOpen).toBe(false);
		expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
	});

	test('draws one waveform panel while the overlay is open', async () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
			store.getState().togglePanel();
			store.getState().toggleOverlay();
		});

		expect(await screen.findAllByRole('group', { name: labels.waveformPanel })).toHaveLength(1);
	});

	test('closes the overlay for a plain link click and stays open for a modified one', async () => {
		const store = renderPlayer();

		document.addEventListener('click', preventNavigation);
		act(() => {
			store.getState().loadQueue(release);
			store.getState().toggleOverlay();
		});

		const link = await waitFor(() => {
			const found = screen.getByRole('dialog', { hidden: true }).querySelector('a[href]');
			if (!found) throw new Error('The overlay rendered no link');

			return found;
		});

		fireEvent.click(link, { metaKey: true });
		fireEvent.click(link, { button: 1 });

		expect(store.getState().isOverlayOpen).toBe(true);

		fireEvent.click(link);

		expect(store.getState().isOverlayOpen).toBe(false);

		document.removeEventListener('click', preventNavigation);
	});

	test('focuses close on open and keeps focus on the tabs when the Tracklist goes', async () => {
		const store = renderPlayer();
		const cuePoints = [
			{ artistLine: 'Nebula Drift', startSeconds: 0, title: 'Opening' },
			{ artistLine: '', startSeconds: 60, title: 'Middle' },
		];

		act(() => {
			store.getState().playTrack([makeItem('a', { cuePoints }), makeItem('b')], 'a');
			store.getState().toggleOverlay();
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: labels.close })).toHaveFocus();
		});

		act(() => {
			screen.getByRole('button', { name: /Middle/ }).focus();
		});
		act(() => {
			store.getState().next();
		});

		expect(screen.getByRole('tab', { name: labels.playlist })).toHaveFocus();
	});

	test('seeks from a cue in the Tracklist and marks the current one', async () => {
		const store = renderPlayer();
		const cuePoints = [
			{ artistLine: 'Nebula Drift', startSeconds: 0, title: 'Opening' },
			{ artistLine: '', startSeconds: 60, title: 'Middle' },
		];

		act(() => {
			store.getState().playTrack([makeItem('a', { cuePoints })], 'a');
			store.getState().toggleOverlay();
		});

		expect(await screen.findByRole('tab', { name: labels.tracklist })).toHaveAttribute(
			'aria-selected',
			'true',
		);

		fireEvent.click(screen.getByRole('button', { name: /Middle/ }));

		expect(fake.engine.seek).toHaveBeenCalledWith(60);
		expect(screen.getByRole('button', { name: /Middle/ })).toHaveAttribute('aria-current', 'true');
		expect(screen.getByRole('button', { name: /Opening/ })).not.toHaveAttribute('aria-current');
	});

	test('offers only the Playlist for an item without cue points', async () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
			store.getState().toggleOverlay();
		});

		expect(await screen.findAllByRole('tab')).toHaveLength(1);
		expect(screen.getByRole('button', { name: /Track b/ })).toBeInTheDocument();
	});

	test('opens a list over the phone layout and closes back to its button', async () => {
		const measure = vi
			.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
			.mockReturnValue(new DOMRect(0, 0, 390, 844));
		const store = renderPlayer();
		const cuePoints = [
			{ artistLine: 'Nebula Drift', startSeconds: 0, title: 'Opening' },
			{ artistLine: '', startSeconds: 60, title: 'Middle' },
		];

		act(() => {
			store.getState().playTrack([makeItem('a', { cuePoints })], 'a');
			store.getState().toggleOverlay();
		});

		const opener = await screen.findByRole('button', { name: labels.tracklist });

		expect(screen.queryByRole('tab')).not.toBeInTheDocument();

		fireEvent.click(opener);

		const sheet = screen.getByRole('dialog', { hidden: true, name: labels.tracklist });

		expect(sheet).toHaveAttribute('open');
		expect(within(sheet).getByRole('button', { name: /Middle/ })).toBeInTheDocument();

		fireEvent.click(within(sheet).getByRole('button', { name: labels.close }));

		expect(sheet).not.toHaveAttribute('open');
		expect(store.getState().isOverlayOpen).toBe(true);
		expect(opener).toHaveFocus();

		measure.mockRestore();
	});

	test('renders a host composition of the parts through Player.Root', () => {
		const store = createPlayerStore({ createEngine: fake.createEngine });

		render(
			<Player.Root className="host-bar" store={store} urls={testUrls}>
				<Player.Transport labels={labels} />
				<Player.Time label={labels.toggleTimeMode} />
			</Player.Root>,
		);

		const root = screen.getByRole('button', { name: labels.play }).closest('.player');

		expect(root).toHaveClass('host-bar');
		expect(root).toHaveAttribute('data-status', 'idle');
		expect(store.getState().urls).toBe(testUrls);
		expect(screen.queryByRole('button', { name: labels.queue })).not.toBeInTheDocument();
	});
});
