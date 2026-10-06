import type { SonicButton } from '@xsynaptic/sonic-ui';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { cloneIcon } from '#lib/icons.ts';
import { template } from '#lib/render.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';
import { stepPanelZoom } from '#store/zoom-levels.ts';

interface ZoomParts {
	control: HTMLDivElement;
	zoomIn: SonicButton;
	zoomOut: SonicButton;
}

// Marked as a panel control, so a press here never starts a drag of the waveform beneath
const renderControl = template(
	'<div class="player-panel-zoom" data-panel-control></div>',
	HTMLDivElement,
);

export class PlayerPanelZoom extends PlayerElement {
	readonly #parts = renderZoomParts();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const { control, zoomIn, zoomOut } = this.#parts;
		const steps = [
			{ button: zoomOut, label: labels.zoomOut, step: -1 },
			{ button: zoomIn, label: labels.zoomIn, step: 1 },
		] as const;

		this.appendOnce(control);

		for (const { button, label, step } of steps) {
			button.setAttribute('aria-label', label);
			button.addEventListener(
				'click',
				() => {
					store.getState().zoomPanel(step);
				},
				{ signal },
			);
		}

		bind(
			store,
			(state) => state.panelPxPerSecond,
			(pxPerSecond) => {
				for (const { button, step } of steps) {
					// Soft rather than `disabled`, since the press that reaches the last level would drop focus to the page
					button.softDisabled = stepPanelZoom(pxPerSecond, step) === pxPerSecond;
				}
			},
			signal,
		);
	}
}

function renderZoomButton(icon: 'zoomIn' | 'zoomOut') {
	return renderSonicButton({
		className: 'player-button-small',
		icons: [cloneIcon(icon)],
		size: 'small',
	});
}

function renderZoomParts(): ZoomParts {
	const control = renderControl();
	const zoomOut = renderZoomButton('zoomOut');
	const zoomIn = renderZoomButton('zoomIn');

	control.append(zoomOut, zoomIn);

	return { control, zoomIn, zoomOut };
}
