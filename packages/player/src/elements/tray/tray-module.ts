import { lazyModule } from '#lib/lazy-module.ts';

export const trayModule = lazyModule(async () => {
	const { PlayerTray } = await import('#elements/tray/tray.ts');

	if (!customElements.get('player-tray')) customElements.define('player-tray', PlayerTray);
});
