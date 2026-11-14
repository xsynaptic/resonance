// Not `CLOUDFLARE_API_TOKEN` in `.env`: cf and wrangler read that name from it and would run every command as this token
export function getWranglerEnv() {
	return { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_DEPLOY_TOKEN };
}
