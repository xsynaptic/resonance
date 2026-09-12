// SoundCloud appends UTM parameters to every `permalink_url`, so the query has to go or nothing joins
export function toStatsKey(url: string): string {
	return url
		.replace(/^https?:\/\/[^/]+/, '')
		.replace(/[#?].*$/, '')
		.replace(/\/+$/, '')
		.toLowerCase();
}
