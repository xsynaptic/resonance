import type { PlayerStore } from '@xsynaptic/plazmoid-core';
import type { SonicButton } from '@xsynaptic/sonic-ui';

import { isLoaded } from '@xsynaptic/plazmoid-core';

import { buttonPart } from '#elements/button-part.ts';
import { playbackStore } from '#elements/player-context.ts';
import { formatTemplate } from '#lib/format.ts';
import { cloneIcon } from '#lib/icons.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';

export const PlayerSeekButton = buttonPart((element) => {
	const seconds = readSeconds(element);

	return {
		// Soft rather than `disabled`, which would drop focus to the page as the track unloads
		apply: (button: SonicButton, isTrackLoaded: boolean) => {
			button.softDisabled = !isTrackLoaded;
		},
		connect: (button, { labels }) => {
			const label = seconds < 0 ? labels.seekBack : labels.seekForward;

			button.setAttribute('aria-label', formatTemplate(label, { seconds: Math.abs(seconds) }));
		},
		press: (state: PlayerStore) => {
			state.seekBy(seconds);
		},
		render: () => renderSonicButton({ className: 'pzm-seek-button', icons: [seekIcon(seconds)] }),
		select: isLoaded,
		store: playbackStore,
	};
});

function readSeconds(element: Element): number {
	const seconds = Number(element.getAttribute('seconds'));
	if (seconds !== 0 && Number.isFinite(seconds)) return seconds;

	throw new Error(`<${element.localName}> needs a non-zero number of seconds`);
}

function seekIcon(seconds: number): SVGSVGElement {
	const icon = cloneIcon(seconds < 0 ? 'seekBack' : 'seekForward');
	const count = icon.querySelector('text');

	if (count) count.textContent = String(Math.abs(seconds));

	return icon;
}
