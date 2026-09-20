import type { APIRequestContext } from '@playwright/test';

import { contentManifestPath, feedPath, getBaseUrl } from '#e2e/constants.ts';

export interface SitePaths {
	cueSheet: string;
	mixDetail: string;
	mixDetailNext: string;
	postDetail: string;
	postTitle: string;
	reviewDetail: string;
}

interface CatalogItem {
	title: string;
	url: string;
}

const mixProbeLimit = 6;

let discovered: Promise<SitePaths> | undefined;

// The request context this was built from is disposed after that test; the resolved value is not
export function getSitePaths(request: APIRequestContext): Promise<SitePaths> {
	if (!discovered) discovered = discover(request);

	return discovered;
}

async function discover(request: APIRequestContext): Promise<SitePaths> {
	const response = await request.get(contentManifestPath);
	const manifest = (await response.json()) as Array<CatalogItem>;
	const review = manifest.find((item) => isDetailPath(item.url, 'reviews'));

	if (!review) throw new Error('The content manifest names no Review');

	const postDetail = await findPostPath(request);
	const post = manifest.find((item) => item.url === postDetail);

	if (!post) throw new Error(`The content manifest does not name ${postDetail}`);

	const mixes = manifest.filter((item) => isDetailPath(item.url, 'mixes'));

	return {
		...(await probeMixes(request, mixes)),
		postDetail,
		postTitle: post.title,
		reviewDetail: review.url,
	};
}

// The feed carries Mixes, Posts and Reviews only, so its one root-level link shape is a Post
async function findPostPath(request: APIRequestContext): Promise<string> {
	const feed = await readText(request, feedPath);

	for (const [, link = ''] of feed.matchAll(/<link>([^<]+)<\/link>/g)) {
		const { pathname } = new URL(link, getBaseUrl());

		if (isRootLevelPath(pathname)) return pathname;
	}

	throw new Error('The feed names no Post');
}

function isDetailPath(url: string, collection: string): boolean {
	return new RegExp(`^/${collection}/[^/]+/$`).test(url);
}

function isRootLevelPath(pathname: string): boolean {
	return /^\/[^/]+\/$/.test(pathname);
}

async function probeMixes(
	request: APIRequestContext,
	mixes: Array<CatalogItem>,
): Promise<Pick<SitePaths, 'cueSheet' | 'mixDetail' | 'mixDetailNext'>> {
	for (const mix of mixes.slice(0, mixProbeLimit)) {
		const html = await readText(request, mix.url);
		const cueSheet = /href="([^"]+\.cue)"/.exec(html)?.[1];
		const mixDetailNext = [...html.matchAll(/href="(\/mixes\/[^"/]+\/)"/g)]
			.map(([, url = '']) => url)
			.find((url) => url !== mix.url);

		if (!cueSheet || !mixDetailNext || !html.includes('data-player-payload')) continue;

		return { cueSheet, mixDetail: mix.url, mixDetailNext };
	}

	throw new Error(`No Mix among the first ${String(mixProbeLimit)} is complete enough to test`);
}

async function readText(request: APIRequestContext, path: string): Promise<string> {
	const response = await request.get(path);

	return response.text();
}
