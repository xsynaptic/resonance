import type { ReactNode } from 'react';

import { Suspense, useRef } from 'react';

import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { QueueIcon } from '#components/icons.tsx';
import { queueTrayPanelPart } from '#components/lazy-parts.ts';
import { PartBoundary } from '#components/part-boundary.tsx';
import { usePreloadWhenQueued } from '#components/preload-when-queued.ts';
import { joinClassNames } from '#lib/class-names.ts';
import { useDismiss } from '#lib/use-dismiss.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

export function QueueControl({
	actions,
	className,
	labels,
}: {
	// Host controls rendered into the tray's header
	actions?: ReactNode | undefined;
	className?: string | undefined;
	labels: PlayerLabels;
}) {
	// Closed renders nothing, so an idle tray costs no layout, no request and its subscriptions no renders
	const isTrayOpen = usePlayer((state) => state.isTrayOpen);
	const store = usePlayerStoreApi();
	const containerRef = useRef<HTMLDivElement>(null);

	usePreloadWhenQueued(queueTrayPanelPart.preload);

	const triggerRef = useRef<HTMLButtonElement>(null);

	const closeTray = (): void => {
		if (store.getState().isTrayOpen) store.getState().toggleTray();
	};

	const onKeyDown = useDismiss({
		containerRef,
		isOpen: isTrayOpen,
		onDismiss: closeTray,
		triggerRef,
	});

	return (
		<div
			className={joinClassNames('player-queue', className)}
			data-open={isTrayOpen ? '' : undefined}
			onKeyDown={onKeyDown}
			ref={containerRef}
		>
			{isTrayOpen ? (
				<PartBoundary onError={closeTray} part={queueTrayPanelPart}>
					<Suspense fallback={undefined}>
						<queueTrayPanelPart.Component actions={actions} labels={labels} />
					</Suspense>
				</PartBoundary>
			) : undefined}
			<Button
				aria-expanded={isTrayOpen}
				aria-label={labels.queue}
				className="player-button-icon"
				onClick={() => {
					store.getState().toggleTray();
				}}
				onFocus={queueTrayPanelPart.preload}
				onPointerEnter={queueTrayPanelPart.preload}
				ref={triggerRef}
			>
				<QueueIcon />
			</Button>
		</div>
	);
}
