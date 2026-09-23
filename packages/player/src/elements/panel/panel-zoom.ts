import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { cloneIcon } from '#lib/icons.ts';
import { requireChildren, template } from '#lib/render.ts';
import { stepPanelZoom } from '#store/zoom-levels.ts';

interface ZoomParts {
	control: HTMLDivElement;
	zoomIn: HTMLButtonElement;
	zoomOut: HTMLButtonElement;
}

// Marked as a panel control, so a press here never starts a drag of the waveform beneath
const renderControl = template(
	/* HTML */ `
		<div class="player-panel-zoom" data-panel-control>
			<button class="player-button player-button-small" type="button"></button
			><button class="player-button player-button-small" type="button"></button>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerPanelZoom extends PlayerElement {
	readonly #parts = renderZoomParts();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const { control, zoomIn, zoomOut } = this.#parts;
		const steps = [
			{ button: zoomOut, icon: 'zoomOut', label: labels.zoomOut, step: -1 },
			{ button: zoomIn, icon: 'zoomIn', label: labels.zoomIn, step: 1 },
		] as const;

		this.appendOnce(control);

		for (const { button, icon, label, step } of steps) {
			button.setAttribute('aria-label', label);
			button.replaceChildren(cloneIcon(icon));
			// `aria-disabled` rather than `disabled`, since the press that reaches the last level would drop focus to the page
			button.addEventListener(
				'click',
				() => {
					if (button.getAttribute('aria-disabled') !== 'true') store.getState().zoomPanel(step);
				},
				{ signal },
			);
		}

		bind(
			store,
			(state) => state.panelPxPerSecond,
			(pxPerSecond) => {
				for (const { button, step } of steps) {
					const isAtLimit = stepPanelZoom(pxPerSecond, step) === pxPerSecond;

					button.setAttribute('aria-disabled', String(isAtLimit));
				}
			},
			signal,
		);
	}
}

function renderZoomParts(): ZoomParts {
	const control = renderControl();
	const [zoomOut, zoomIn] = requireChildren(control, 'button', 2, HTMLButtonElement);

	return { control, zoomIn, zoomOut };
}
