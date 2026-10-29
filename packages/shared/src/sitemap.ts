export function getUrlPathIndexing(pathname: string) {
	const normalized = pathname.replace(/\/$/, '');

	// Paginated routes repeat content already indexed at page one
	if (/\/\d+$/.test(normalized)) return { follow: true, index: false };

	return { follow: true, index: true };
}
