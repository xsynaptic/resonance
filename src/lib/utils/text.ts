import { getNumberFormat } from '#lib/i18n/i18n-formatters.ts';

export function formatNumber({
	locales,
	number,
	options,
}: {
	locales?: string | undefined;
	number: number | string;
	options?: Intl.NumberFormatOptions | undefined;
}) {
	return getNumberFormat(locales ?? 'en', options).format(Number(number));
}

export function formatStringTemplate(
	template: string,
	values: Record<string, number | string> = {},
): string {
	return template.replaceAll(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}
