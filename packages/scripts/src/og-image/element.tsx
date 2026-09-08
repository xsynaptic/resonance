import { openGraphImageHeight, openGraphImageWidth, siteTitle } from '@xsynaptic/shared/constants';
import { readFileSync } from 'node:fs';
import { Bitmap } from 'takumi-js/helpers/jsx';

import type { ProcessedImage } from '#og-image/generate.ts';
import type { OpenGraphCard } from '#og-image/types.ts';

// Palette tokens from src/styles/main/parts/theme.css, resolved to hex
const colorBackground = '#1c1f21'; // surface-900
const colorImageFrame = '#2b3136'; // surface-700
const colorTitle = '#e9f2f2'; // ink-50
const colorBrand = '#819798'; // ink-600
const colorLabel = '#fd8a30'; // highlight-400
const colorPattern = '#24292d'; // surface-600 at the `maze` utility's opacity, flattened
const colorGlow = 'rgba(36, 41, 45, 0.5)';

const cardPadding = 64;
const columnGap = 48;
const featuredImageFrame = 1;

// Three times the site's tile: a card is usually seen at a fraction of its 1200px output
const patternSize = 180;

export const featuredImageSize = openGraphImageHeight - cardPadding * 2 - featuredImageFrame * 2;

// Fully gone only behind the middle of the Featured Image, which covers the last of it anyway
const patternFadeEnd = openGraphImageWidth - cardPadding - featuredImageSize / 2;

// Tilt the pattern for a little dynamism
const patternFadeAngle = 105;

// The image takes most of the width, so the title has to give some back
const titleSizeWithImage = 56;
const titleSizeWithoutImage = 76;

// `currentColor` has nothing to inherit from inside a data URI, so the tile is recolored on the way in
function readPatternImage() {
	const svg = readFileSync(new URL('../../../../public/patterns/maze.svg', import.meta.url), 'utf8')
		.replace('currentColor', () => colorPattern)
		.trim();

	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const patternImage = readPatternImage();

export function getOpenGraphElement(card: OpenGraphCard, featuredImage?: ProcessedImage) {
	return (
		<div
			style={{
				backgroundColor: colorBackground,
				display: 'flex',
				gap: `${String(columnGap)}px`,
				height: `${String(openGraphImageHeight)}px`,
				padding: `${String(cardPadding)}px`,
				position: 'relative',
				width: `${String(openGraphImageWidth)}px`,
			}}
		>
			<div
				style={{
					backgroundImage: patternImage,
					backgroundRepeat: 'repeat',
					backgroundSize: `${String(patternSize)}px ${String(patternSize)}px`,
					display: 'flex',
					inset: 0,
					position: 'absolute',
					...(featuredImage
						? {
								maskImage: `linear-gradient(${String(patternFadeAngle)}deg, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0) ${String(patternFadeEnd)}px)`,
							}
						: {}),
				}}
			/>
			<div
				style={{
					display: 'flex',
					flex: 1,
					flexDirection: 'column',
					justifyContent: 'space-between',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{card.label ? (
						<div
							style={{
								color: colorLabel,
								fontFamily: 'Fira Sans',
								fontSize: '26px',
								fontWeight: 700,
								letterSpacing: '3px',
								lineHeight: 1.2,
								paddingBottom: '20px',
							}}
						>
							{card.label.toUpperCase()}
						</div>
					) : undefined}
					<div
						style={{
							color: colorTitle,
							fontFamily: 'Fira Sans',
							fontSize: `${String(featuredImage ? titleSizeWithImage : titleSizeWithoutImage)}px`,
							fontWeight: 700,
							lineClamp: card.label ? 3 : 4,
							lineHeight: 1.15,
							textOverflow: 'ellipsis',
						}}
					>
						{card.title}
					</div>
				</div>
				<div
					style={{
						color: colorBrand,
						fontFamily: 'Manrope',
						fontSize: '22px',
						fontWeight: 800,
						letterSpacing: '4px',
						lineHeight: 1.2,
					}}
				>
					{siteTitle.toUpperCase()}
				</div>
			</div>
			{featuredImage ? (
				<div
					style={{
						backgroundColor: colorImageFrame,
						borderRadius: '5px',
						boxShadow: `0 0 75px 30px ${colorGlow}`,
						display: 'flex',
						padding: `${String(featuredImageFrame)}px`,
					}}
				>
					<Bitmap
						data={featuredImage.data}
						height={featuredImage.height}
						style={{ borderRadius: '4px' }}
						width={featuredImage.width}
					/>
				</div>
			) : undefined}
		</div>
	);
}
