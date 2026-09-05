import type { ComponentProps } from 'react';

import { joinClassNames } from '#lib/class-names.ts';

export function Button({ className, type = 'button', ...props }: ComponentProps<'button'>) {
	return <button className={joinClassNames('player-button', className)} type={type} {...props} />;
}
