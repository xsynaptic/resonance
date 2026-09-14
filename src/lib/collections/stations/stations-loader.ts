import { file } from 'astro/loaders';
import { parse } from 'yaml';

import { stationsDataPath } from '#constants.ts';

export function stationsLoader() {
	return file(stationsDataPath, {
		parser: (text) => {
			const stations: unknown = parse(text);

			if (!Array.isArray(stations))
				throw new Error(`${stationsDataPath} must be a list of stations`);

			return stations.map((station: Record<string, unknown>, position) => ({
				...station,
				position,
			}));
		},
	});
}
