export interface DialogExit {
	cancel: () => void;
	slide: () => void;
}

interface DialogExitOptions {
	onClosed: () => void;
	// Escape or the back gesture, when the dialog's closing runs through something else first
	onRequest?: () => void;
}

// Animated rather than a CSS exit, so a close slides from wherever a drag left the dialog
export function dialogExit(
	dialog: HTMLDialogElement,
	{ onClosed, onRequest }: DialogExitOptions,
	signal: AbortSignal,
): DialogExit {
	let exit: Animation | undefined;

	const cancel = (): void => {
		exit?.cancel();
		exit = undefined;
		dialog.style.translate = '';
	};
	const finish = async (running: Animation): Promise<void> => {
		try {
			await running.finished;
		} catch {
			// A reopen cancels the exit and owns the dialog from there
			return;
		}

		onClosed();
		cancel();
	};
	const slide = (): void => {
		if (exit) return;
		if (!dialog.open) {
			onClosed();
			return;
		}

		exit = dialog.animate({ opacity: 0, translate: '0 100%' }, dialogTransition(dialog));
		void finish(exit);
	};

	// The browser lets a close request wait only while it is cancelable; one that is not closes at once
	dialog.addEventListener(
		'cancel',
		(event) => {
			if (!event.cancelable) return;

			event.preventDefault();
			(onRequest ?? slide)();
		},
		{ signal },
	);

	return { cancel, slide };
}

function dialogTransition(dialog: HTMLElement): KeyframeAnimationOptions {
	const { transitionDuration, transitionTimingFunction } = getComputedStyle(dialog);
	// eslint-disable-next-line unicorn/prefer-number-coercion -- parsing has to stop at the unit
	const seconds = Number.parseFloat(transitionDuration);

	// A dialog with no stylesheet reports no transition, and closes at once
	return {
		duration: Number.isFinite(seconds) ? seconds * 1000 : 0,
		easing: transitionTimingFunction || 'linear',
		fill: 'forwards',
	};
}
