export interface Dismissable {
	container: HTMLElement;
	isOpen: () => boolean;
	onDismiss: () => void;
	trigger: HTMLElement;
}

export function bindDismiss(dismissable: Dismissable, signal: AbortSignal): void {
	const { container, isOpen, onDismiss, trigger } = dismissable;

	// A click rather than a press, since a touch that scrolls the page ends in `pointercancel` and never clicks
	// The path is fixed at dispatch, so a press that removes its own row still counts as inside
	document.addEventListener(
		'click',
		(event) => {
			if (!isOpen() || event.composedPath().includes(container)) return;

			onDismiss();
		},
		{ signal },
	);
	container.addEventListener(
		'keydown',
		(event) => {
			if (!isOpen() || event.key !== 'Escape') return;

			onDismiss();
			trigger.focus();
		},
		{ signal },
	);
}
