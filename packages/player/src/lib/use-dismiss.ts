import type { KeyboardEvent, RefObject } from 'react';

import { useEffect, useEffectEvent } from 'react';

export function useDismiss({
	containerRef,
	isOpen,
	onDismiss,
	triggerRef,
}: {
	containerRef: RefObject<HTMLElement | null>;
	isOpen: boolean;
	onDismiss: () => void;
	triggerRef: RefObject<HTMLButtonElement | null>;
}) {
	const dismiss = useEffectEvent(onDismiss);

	useEffect(() => {
		if (!isOpen) return;

		// A click rather than a press, since a touch that scrolls the page ends in `pointercancel` and never clicks
		// The path is fixed at dispatch, so a press that removes its own row still counts as inside
		const onClick = (event: MouseEvent): void => {
			const container = containerRef.current;
			if (container && event.composedPath().includes(container)) return;

			dismiss();
		};

		document.addEventListener('click', onClick);

		return () => {
			document.removeEventListener('click', onClick);
		};
	}, [containerRef, isOpen]);

	return function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
		if (!isOpen || event.key !== 'Escape') return;

		onDismiss();
		triggerRef.current?.focus();
	};
}
