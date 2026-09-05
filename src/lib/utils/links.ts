// Outbound links arrive as bare URLs, so the host is the only thing left to name the source by
export function getLinkSourceLabel(url: string): string {
	const host = new URL(url).hostname.replace(/^www\./, '');
	const name = host.split('.').at(-2) ?? host;

	return name.charAt(0).toUpperCase() + name.slice(1);
}
