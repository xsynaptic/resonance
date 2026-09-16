import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bindButton } from '#lib/bind-button.ts';
import { renderIconButton } from '#lib/icon-button.ts';
import { cloneIcon } from '#lib/icons.ts';
import { isLoaded } from '#store/selectors.ts';

export class PlayerSeekButton extends PlayerElement {
	readonly #button = renderIconButton('player-seek-button');

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const seconds = readSeconds(this);
		const button = this.#button;
		const icon = cloneIcon(seconds < 0 ? 'seekBack' : 'seekForward');
		const count = icon.querySelector('text');

		if (count) count.textContent = String(Math.abs(seconds));

		this.appendOnce(button);
		button.setAttribute('aria-label', seconds < 0 ? labels.seekBack : labels.seekForward);
		button.replaceChildren(icon);
		bindButton(
			{
				apply: (isTrackLoaded) => {
					button.disabled = !isTrackLoaded;
				},
				button,
				press: (state) => {
					state.seekBy(seconds);
				},
				select: isLoaded,
				store,
			},
			signal,
		);
	}
}

function readSeconds(element: Element): number {
	const seconds = Number(element.getAttribute('seconds'));
	if (seconds !== 0 && Number.isFinite(seconds)) return seconds;

	throw new Error(`<${element.localName}> needs a non-zero number of seconds`);
}
