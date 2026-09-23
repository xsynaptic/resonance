import { buttonPart } from '#elements/button-part.ts';
import { renderIconButton } from '#lib/icon-button.ts';
import { cloneIcon } from '#lib/icons.ts';
import { isLoaded } from '#store/selectors.ts';

export const PlayerSeekButton = buttonPart((element) => {
	const seconds = readSeconds(element);

	return {
		apply: (button, isTrackLoaded: boolean) => {
			button.disabled = !isTrackLoaded;
		},
		connect: (button) => {
			button.replaceChildren(seekIcon(seconds));
		},
		label: seconds < 0 ? 'seekBack' : 'seekForward',
		press: (state) => {
			state.seekBy(seconds);
		},
		render: () => renderIconButton('player-seek-button'),
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
