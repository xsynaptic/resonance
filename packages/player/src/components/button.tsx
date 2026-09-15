import type { ComponentProps } from 'react';

import { joinClassNames } from '#lib/class-names.ts';

// `aria-disabled` rather than `disabled` for a control its own press can make inert, which would otherwise drop focus to the page
export function Button({
	className,
	onClick,
	type = 'button',
	...props
}: ComponentProps<'button'>) {
	const isInert = props['aria-disabled'] === true || props['aria-disabled'] === 'true';

	return (
		<button
			className={joinClassNames('player-button', className)}
			onClick={isInert ? undefined : onClick}
			type={type}
			{...props}
		/>
	);
}
