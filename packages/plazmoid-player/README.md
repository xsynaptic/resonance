# @xsynaptic/plazmoid-player

The elements, the waveform and the dark skin of the Plazmoid player: a bar, a queue tray, a waveform panel, a scope and a mobile overlay, built as light-DOM custom elements on [sonic-ui](https://www.npmjs.com/package/@xsynaptic/sonic-ui) controls. Playback itself is `@xsynaptic/plazmoid-core`, which a host installs beside this package and creates the stores from.

## Mounting a player

```ts
import { createPlayerStore } from '@xsynaptic/plazmoid-core';
import { createPlayer, createViewStore } from '@xsynaptic/plazmoid-player';
import { defaultLabels } from '@xsynaptic/plazmoid-player/labels';

import '@xsynaptic/plazmoid-player/player.css';

const root = createPlayer({
	labels: { ...defaultLabels },
	store: createPlayerStore(),
	urls: {
		detail: (track) => fetchDetail(track),
		stream: (track) =>
			Promise.resolve({
				sources: [{ type: 'audio/mp4; codecs="Opus"', url: streamUrlOf(track) }],
				status: 'ok',
			}),
	},
	view: createViewStore(),
});

document.body.append(root);
```

`createPlayer` registers the bar's elements when it is called and returns a `<pzm-root>` holding a `<pzm-bar>`. The two stores belong to the host: a root missing either throws as its parts connect.

## Entries

| Entry | Holds |
| --- | --- |
| `.` | `createPlayer`, `createViewStore`, `LazyModuleError` and their types. Registers nothing at import |
| `./define` | Registers the sonic-ui controls and every tag the bar connects eagerly |
| `./define/<part>` | Registers one tag and the sonic-ui controls it renders: `pzm-play-button` is `./define/play-button` |
| `./labels` | `defaultLabels`. Loads in Node, so a build step can read it |
| `./constants` | Storage keys and the bar's artwork size. Loads in Node |
| `./astro` | `bindAstroRouter`, for a host on Astro's client router |
| `./player.css` | The skin |

The main entry cannot load in Node, since its elements extend `HTMLElement` at import.

The define entries are side effects. A bundler that has not read this package's `sideEffects` drops them and leaves the tags unregistered.

## Lazy parts

Four parts load in chunks of their own the first time they open: the overlay's body (with `pzm-cue-list`), the tray (`pzm-tray`, `pzm-queue-actions`), the panel's surface (`pzm-panel-zoom`, `sonic-waveform`) and the scope's surface (`sonic-waveform`). `./define` leaves those tags to their chunks. Importing one of their `./define/<part>` entries registers it ahead of the chunk and puts its code in the host's bundle.

A chunk that fails to load closes its part and calls `reportError` with a `LazyModuleError`; playback is unaffected.

## Labels

`labels` is required on `createPlayer`, so a host that translates every string ships none of the English. `defaultLabels` is the English set; spread it and override what differs:

```ts
const labels = { ...defaultLabels, capped: 'Streaming is for members' };
```

Four labels carry placeholders, filled in where they are used:

| Label                     | Placeholders                      |
| ------------------------- | --------------------------------- |
| `moved`                   | `{position}`, `{total}`           |
| `seekBack`, `seekForward` | `{seconds}`, the root's seek step |
| `seekPosition`            | `{current}`, `{duration}`         |

## Styling against state

`<pzm-root>` carries the player's state as attributes, for a host's own rules:

| Attribute | Present while |
| --- | --- |
| `data-status` | Always: `idle`, `loading`, `playing`, `paused`, `error`, `capped` or `unplayable` |
| `data-empty` | Nothing is queued |
| `data-pending` | The displayed track's detail has not been answered |
| `data-paused` | Playback is paused, or has not started |
| `data-waiting` | A load is heading for playback |
| `data-muted` | The player is muted |

A host that never settles its `detail` resolver leaves the root pending for good, so a rule that hides the bar under `data-pending` hides it for good too.

The tags, the `pzm-*` classes and the `--pzm-*` tokens are public by their prefix.

### Motion that carries meaning

`data-pzm-essential-motion` sits on an element only while it runs an animation that means something: the loading ring on Play, today. A host with a global reduced-motion reset leaves it out, so the ring still shows a load is under way:

```css
@media (prefers-reduced-motion: reduce) {
	*:not([data-pzm-essential-motion])::after {
		animation-duration: 0.01ms !important;
	}
}
```

The skin already slows the ring to a fade under reduced motion.

## Waveforms

A track's detail may carry a Peaks descriptor from `@xsynaptic/plazmoid-wavedata`. The panel and the scope draw it only when its `formatVersion` is one this package reads; for any other they draw as if the track had none. The Overview on the seek strip is drawn either way.
