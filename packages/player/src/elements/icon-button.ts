import { template } from '#lib/render.ts';

const renderButton = template(
	'<button class="player-button player-button-icon" type="button"></button>',
	HTMLButtonElement,
);

export function renderIconButton(...classNames: ReadonlyArray<string>): HTMLButtonElement {
	const button = renderButton();

	button.classList.add(...classNames);

	return button;
}
