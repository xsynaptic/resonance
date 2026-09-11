import type { ReactNode } from 'react';

import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { QueueIcon } from '#components/icons.tsx';
import { QueueTray } from '#components/queue-tray.tsx';
import { joinClassNames } from '#lib/class-names.ts';
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
	const isTrayOpen = usePlayer((state) => state.isTrayOpen);
	const store = usePlayerStoreApi();

	return (
		<div
			className={joinClassNames('player-queue', className)}
			data-open={isTrayOpen ? '' : undefined}
		>
			<QueueTray actions={actions} labels={labels} />
			<Button
				aria-expanded={isTrayOpen}
				aria-label={labels.queue}
				className="player-button-icon"
				onClick={() => {
					store.getState().toggleTray();
				}}
			>
				<QueueIcon />
			</Button>
		</div>
	);
}
