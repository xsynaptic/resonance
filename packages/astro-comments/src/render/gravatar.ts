export interface CommentAvatar {
	srcSet: string;
	url: string;
}

// `blank` leaves the site's own fallback tile showing when Gravatar has no image for the address
const gravatarUrl = 'https://www.gravatar.com/avatar';

export function toGravatarAvatar(
	emailHash: string | undefined,
	size: number,
): CommentAvatar | undefined {
	if (emailHash === undefined) return undefined;

	const url = toGravatarUrl(emailHash, size);

	return { srcSet: `${url} 1x, ${toGravatarUrl(emailHash, size * 2)} 2x`, url };
}

function toGravatarUrl(emailHash: string, size: number): string {
	return `${gravatarUrl}/${emailHash}?d=blank&s=${String(size)}`;
}
