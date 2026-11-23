const retryBaseMs = 2000;
const retryCapMs = 30_000;

export function retryDelayMs(failures: number): number {
	return Math.min(retryCapMs, retryBaseMs * 2 ** (failures - 1));
}
