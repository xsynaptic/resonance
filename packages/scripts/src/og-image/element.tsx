import { openGraphImageHeight, openGraphImageWidth, siteTitle } from '@xsynaptic/shared/constants';
import { Bitmap } from 'takumi-js/helpers/jsx';

import type { ProcessedImage } from './generate.js';
import type { OpenGraphCard } from './types.js';

// Palette tokens from src/styles/main/parts/theme.css, resolved to hex
const colorBackground = '#1c1f21'; // surface-900
const colorCoverFrame = '#2b3136'; // surface-700
const colorTitle = '#e9f2f2'; // ink-50
const colorBrand = '#819798'; // ink-600
const colorLabel = '#cde651'; // accent-400

const cardPadding = 64;
const columnGap = 48;

export const coverSize = 470;

// A cover takes most of the width, so the title has to give some back
const titleSizeWithCover = 56;
const titleSizeWithoutCover = 76;

export function getOpenGraphElement(card: OpenGraphCard, cover?: ProcessedImage) {
	return (
		<div
			style={{
				alignItems: 'stretch',
				backgroundColor: colorBackground,
				display: 'flex',
				gap: `${String(columnGap)}px`,
				height: `${String(openGraphImageHeight)}px`,
				padding: `${String(cardPadding)}px`,
				width: `${String(openGraphImageWidth)}px`,
			}}
		>
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
							fontSize: `${String(cover ? titleSizeWithCover : titleSizeWithoutCover)}px`,
							fontWeight: 700,
							lineClamp: 3,
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
						fontWeight: 600,
						letterSpacing: '4px',
						lineHeight: 1.2,
					}}
				>
					{siteTitle.toUpperCase()}
				</div>
			</div>
			{cover ? (
				<div style={{ alignItems: 'center', display: 'flex' }}>
					{/* A hairline frame, as box model rather than a border: dark art on a dark card vanishes without one */}
					<div
						style={{
							backgroundColor: colorCoverFrame,
							borderRadius: '5px',
							display: 'flex',
							padding: '1px',
						}}
					>
						<Bitmap
							data={cover.data}
							height={cover.height}
							style={{ borderRadius: '4px' }}
							width={cover.width}
						/>
					</div>
				</div>
			) : undefined}
		</div>
	);
}
