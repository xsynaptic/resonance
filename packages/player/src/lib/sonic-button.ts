import type { IconName } from '#lib/icons.ts';

import { cloneIcon } from '#lib/icons.ts';

const buttonSizes = { primary: 36, regular: 32, small: 24 } as const;

type ButtonSize = keyof typeof buttonSizes;

interface ButtonRender {
	className?: string;
	icons: ReadonlyArray<SVGSVGElement>;
	size?: ButtonSize;
}

export function fillButton(
	button: HTMLElement,
	icons: ReadonlyArray<SVGSVGElement>,
	size: ButtonSize = 'regular',
): void {
	const iconSize = Number(icons[0]?.getAttribute('height'));

	button.style.setProperty('--player-icon-ratio', String(iconSize / buttonSizes[size]));
	button.append(...icons);
}

export function legendIcons(names: ReadonlyArray<IconName>): Array<SVGSVGElement> {
	return names.map((name) => {
		const icon = cloneIcon(name);

		icon.dataset.sonicWhen = name;

		return icon;
	});
}

export function renderSonicButton({ className, icons, size }: ButtonRender) {
	const button = document.createElement('sonic-button');

	if (className !== undefined) button.className = className;
	fillButton(button, icons, size);

	return button;
}
