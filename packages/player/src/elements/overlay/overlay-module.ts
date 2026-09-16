import { trayModule } from '#elements/tray/tray-module.ts';
import { lazyModule } from '#lib/lazy-module.ts';

export const overlayBodyModule = lazyModule('overlay', async () => {
	trayModule.preload();

	const { connectOverlayBody } = await import('#elements/overlay/overlay-body.ts');

	await trayModule.load();

	return connectOverlayBody;
});
