// Core keeps its own copy for the detail retry; this one leaves with the reader
// fallow-ignore-next-line code-duplication
const retryBaseMs = 2000;
const retryCapMs = 30_000;

export function retryDelayMs(failures: number): number {
	return Math.min(retryCapMs, retryBaseMs * 2 ** (failures - 1));
}
