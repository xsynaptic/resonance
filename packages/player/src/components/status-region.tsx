import { useState } from 'react';

import type { PlayerLabels, PlayerStatus } from '#types.ts';

import { SkullIcon } from '#components/icons.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';

type ReportedStatus = 'capped' | 'error' | 'loading';

export function StatusRegion({
	className,
	labels,
}: {
	className?: string | undefined;
	labels: Pick<PlayerLabels, 'capped' | 'error' | 'loading'>;
}) {
	const status = usePlayer((state) => state.status);
	const reported = reportedStatus(status);
	const [shown, setShown] = useState<ReportedStatus | undefined>(undefined);

	if (reported !== undefined && reported !== shown) setShown(reported);

	return (
		<span
			aria-live="polite"
			className={joinClassNames('player-status', className)}
			data-status={shown}
			data-visible={reported === undefined ? undefined : ''}
			role="status"
		>
			{shown === 'error' ? <SkullIcon /> : undefined}
			{shown === undefined ? '' : labels[shown]}
		</span>
	);
}

function reportedStatus(status: PlayerStatus): ReportedStatus | undefined {
	if (status === 'capped') return 'capped';
	if (status === 'error') return 'error';
	if (status === 'loading') return 'loading';

	return undefined;
}
