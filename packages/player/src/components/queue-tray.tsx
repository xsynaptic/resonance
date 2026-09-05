import type { ReactNode } from 'react';

import { Fragment } from 'react';

import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { CloseIcon, ShuffleIcon } from '#components/icons.tsx';
import { isSectioned } from '#queue/queue.ts';
import { usePlayer } from '#store/context.tsx';

interface QueueTrayProps {
	actions?: ReactNode;
	labels: Pick<PlayerLabels, 'clearQueue' | 'empty' | 'removeFromQueue' | 'shuffle'>;
}

// Renders nothing when closed, so it costs no layout while the bar is idle
export function QueueTray({ actions, labels }: QueueTrayProps) {
	const isOpen = usePlayer((state) => state.isTrayOpen);
	const queue = usePlayer((state) => state.queue);
	const currentIndex = usePlayer((state) => state.currentIndex);
	const isShuffling = usePlayer((state) => state.isShuffling);
	const playAt = usePlayer((state) => state.playAt);
	const removeAt = usePlayer((state) => state.removeAt);
	const clearQueue = usePlayer((state) => state.clearQueue);
	const toggleShuffle = usePlayer((state) => state.toggleShuffle);

	if (!isOpen) return;

	return (
		<div className="player-tray">
			<div className="player-tray-header">
				{isSectioned(queue) ? undefined : (
					<button
						aria-label={labels.shuffle}
						aria-pressed={isShuffling}
						className="player-tray-action"
						onClick={toggleShuffle}
						type="button"
					>
						<ShuffleIcon />
						{labels.shuffle}
					</button>
				)}
				<button className="player-tray-action" onClick={clearQueue} type="button">
					{labels.clearQueue}
				</button>
				{actions}
			</div>
			{queue.length === 0 ? (
				<p className="player-tray-empty">{labels.empty}</p>
			) : (
				<ul className="player-tray-list">
					{queue.map((item, index) => (
						<Fragment key={`${item.trackId}-${String(index)}`}>
							{item.sectionLabel === undefined ? undefined : (
								<li className="player-tray-section">{item.sectionLabel}</li>
							)}
							<li
								className="player-tray-item"
								data-current={index === currentIndex ? '' : undefined}
							>
								<button
									className="player-tray-pick"
									onClick={() => {
										playAt(index);
									}}
									type="button"
								>
									<span className="player-tray-title">{item.title}</span>{' '}
									<span className="player-tray-artist">{item.artistLine}</span>
								</button>
								<Button
									aria-label={labels.removeFromQueue}
									className="player-button-small"
									onClick={() => {
										removeAt(index);
									}}
								>
									<CloseIcon />
								</Button>
							</li>
						</Fragment>
					))}
				</ul>
			)}
		</div>
	);
}
