import { defineOnce } from '#elements/define-once.ts';
import { lazyModule } from '#lib/lazy-module.ts';

export const trayModule = lazyModule('tray', async () => {
	const { PlayerTray } = await import('#elements/tray/tray.ts');

	defineOnce('player-tray', PlayerTray);
});
