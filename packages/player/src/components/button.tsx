import type { ComponentProps } from 'react';

export function Button({ className, type = 'button', ...props }: ComponentProps<'button'>) {
	return (
		<button
			className={className ? `player-button ${className}` : 'player-button'}
			type={type}
			{...props}
		/>
	);
}
