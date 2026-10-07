import type { IconName } from '#lib/icons.ts';

import { cloneIcon } from '#lib/icons.ts';

interface ButtonRender {
	className?: string;
	icons: ReadonlyArray<SVGSVGElement>;
}

export function fillButton(button: HTMLElement, icons: ReadonlyArray<SVGSVGElement>): void {
	button.style.setProperty('--player-icon-px', icons[0]?.getAttribute('height') ?? '');
	button.append(...icons);
}

export function legendIcons(names: ReadonlyArray<IconName>): Array<SVGSVGElement> {
	return names.map((name) => {
		const icon = cloneIcon(name);

		icon.dataset.sonicWhen = name;

		return icon;
	});
}

export function renderSonicButton({ className, icons }: ButtonRender) {
	const button = document.createElement('sonic-button');

	if (className !== undefined) button.className = className;
	fillButton(button, icons);

	return button;
}
