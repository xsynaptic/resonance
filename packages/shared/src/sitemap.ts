const archiveYearPattern = /^\/archive\/\d{4}$/;

export function getUrlPathIndexing(pathname: string) {
	const normalized = pathname.replace(/\/$/, '');

	if (archiveYearPattern.test(normalized)) return { follow: true, index: true };

	// Paginated routes repeat content already indexed at page one
	if (/\/\d+$/.test(normalized)) return { follow: true, index: false };

	return { follow: true, index: true };
}
