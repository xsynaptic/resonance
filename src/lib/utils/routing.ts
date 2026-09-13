export function getAbsoluteUrl(path: string): string {
	return new URL(path, import.meta.env.SITE).href;
}

export function getPathWithTrailingSlash(...routeParts: Array<string>): string {
	return [...routeParts, '/'].join('/').replaceAll(/(?<!:)\/\/+/g, '/');
}
