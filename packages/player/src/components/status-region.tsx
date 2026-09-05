import type { MiniPlayerLabels } from '#types.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';

export function StatusRegion({
	className,
	labels,
}: {
	className?: string | undefined;
	labels: Pick<MiniPlayerLabels, 'capped' | 'error' | 'loading'>;
}) {
	const status = usePlayer((state) => state.status);
	const messages: Partial<Record<typeof status, string>> = {
		capped: labels.capped,
		error: labels.error,
		loading: labels.loading,
	};

	return (
		<span
			aria-live="polite"
			className={joinClassNames('player-status', className)}
			data-status={status}
			role="status"
		>
			{messages[status] ?? ''}
		</span>
	);
}
