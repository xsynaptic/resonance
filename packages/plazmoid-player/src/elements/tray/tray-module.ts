import { defineOnce } from '#elements/define-once.ts';
import { lazyModule } from '#lib/lazy-module.ts';

export const trayModule = lazyModule('tray', async () => {
	const [{ PlayerQueueActions }, { PlayerTray }] = await Promise.all([
		import('#elements/tray/queue-actions.ts'),
		import('#elements/tray/tray.ts'),
	]);

	defineOnce('pzm-queue-actions', PlayerQueueActions);
	defineOnce('pzm-tray', PlayerTray);
});
