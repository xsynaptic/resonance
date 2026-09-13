export function formatNumber({
	locales,
	number,
	options,
}: {
	locales?: Intl.LocalesArgument | undefined;
	number: number | string;
	options?: Intl.NumberFormatOptions | undefined;
}) {
	return new Intl.NumberFormat(locales ?? 'en', options).format(Number(number));
}

export function formatStringTemplate(
	template: string,
	values: Record<string, number | string> = {},
): string {
	return template.replaceAll(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

// Name to slug, matching the extractor's rule so a free-text name lines up with a term's id
export function toSlug(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replaceAll(/[\u{300}-\u{36F}]/gu, '')
		.replaceAll(/[^a-z0-9]+/gu, '-')
		.replaceAll(/^-+|-+$/gu, '');
}
