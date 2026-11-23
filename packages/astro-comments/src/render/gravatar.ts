export interface CommentAvatar {
	srcSet: string;
	url: string;
}

// `blank` leaves the site's own fallback tile showing when Gravatar has no image for the address
const gravatarUrl = 'https://www.gravatar.com/avatar';

export function toGravatarAvatar(
	gravatarHash: null | string,
	size: number,
): CommentAvatar | undefined {
	if (gravatarHash === null) return undefined;

	const url = toGravatarUrl(gravatarHash, size);

	return { srcSet: `${url} 1x, ${toGravatarUrl(gravatarHash, size * 2)} 2x`, url };
}

function toGravatarUrl(gravatarHash: string, size: number): string {
	return `${gravatarUrl}/${gravatarHash}?d=blank&s=${String(size)}`;
}
