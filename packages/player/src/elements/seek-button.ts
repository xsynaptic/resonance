import type { SonicButton } from '@xsynaptic/sonic-ui';

import { buttonPart } from '#elements/button-part.ts';
import { formatTemplate } from '#lib/format.ts';
import { cloneIcon } from '#lib/icons.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';
import { isLoaded } from '#store/selectors.ts';

export const PlayerSeekButton = buttonPart((element) => {
	const seconds = readSeconds(element);

	return {
		apply: (button: SonicButton, isTrackLoaded: boolean) => {
			button.disabled = !isTrackLoaded;
		},
		connect: (button, { labels }) => {
			const label = seconds < 0 ? labels.seekBack : labels.seekForward;

			button.setAttribute('aria-label', formatTemplate(label, { seconds: Math.abs(seconds) }));
		},
		press: (state) => {
			state.seekBy(seconds);
		},
		render: () =>
			renderSonicButton({ className: 'player-seek-button', icons: [seekIcon(seconds)] }),
		select: isLoaded,
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
