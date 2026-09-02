import { z } from 'zod';

// snake_case is the wire format, kept verbatim
// Optional everywhere but `completions`, which is all a legacy-only entry carries
export const downloadStatsSchema = z
	.object({
		byte_equivalents: z.number().optional(),
		completions: z.number(),
		daily: z.record(z.string(), z.number()).optional(),
		first_seen: z.string().optional(),
		key: z.string(),
		size_bytes: z.number().optional(),
	})
	.strict();
