import { z } from 'zod';

// One entry from downloads.json (emitted by deploy/stats/download-stats.py on the file
// server, pulled via stats-pull); snake_case keys are kept verbatim from the wire format
export const downloadStatsSchema = z
	.object({
		byte_equivalents: z.number(),
		completions: z.number(),
		daily: z.record(z.string(), z.number()),
		first_seen: z.string(),
		key: z.string(),
		size_bytes: z.number(),
	})
	.strict();
