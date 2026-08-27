import {
	OPEN_GRAPH_IMAGE_HEIGHT,
	OPEN_GRAPH_IMAGE_WIDTH,
	SITE_TITLE,
} from '@xsynaptic/shared/constants';
import { Bitmap } from 'takumi-js/helpers/jsx';

import type { ProcessedImage } from './generate.js';
import type { OpenGraphCard } from './types.js';

// Palette tokens from src/styles/main/parts/theme.css, resolved to hex
const COLOR_BACKGROUND = '#1c1f21'; // surface-900
const COLOR_COVER_FRAME = '#2b3136'; // surface-700
const COLOR_TITLE = '#e9f2f2'; // ink-50
const COLOR_BRAND = '#819798'; // ink-600
const COLOR_LABEL = '#cde651'; // accent-400

const PADDING = 64;
const COLUMN_GAP = 48;

export const COVER_SIZE = 470;

// A cover takes most of the width, so the title has to give some back
const TITLE_SIZE_WITH_COVER = 56;
const TITLE_SIZE_WITHOUT_COVER = 76;

export function getOpenGraphElement(card: OpenGraphCard, cover?: ProcessedImage) {
	return (
		<div
			style={{
				alignItems: 'stretch',
				backgroundColor: COLOR_BACKGROUND,
				display: 'flex',
				gap: `${String(COLUMN_GAP)}px`,
				height: `${String(OPEN_GRAPH_IMAGE_HEIGHT)}px`,
				padding: `${String(PADDING)}px`,
				width: `${String(OPEN_GRAPH_IMAGE_WIDTH)}px`,
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
								color: COLOR_LABEL,
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
							color: COLOR_TITLE,
							fontFamily: 'Fira Sans',
							fontSize: `${String(cover ? TITLE_SIZE_WITH_COVER : TITLE_SIZE_WITHOUT_COVER)}px`,
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
						color: COLOR_BRAND,
						fontFamily: 'Manrope',
						fontSize: '22px',
						fontWeight: 600,
						letterSpacing: '4px',
						lineHeight: 1.2,
					}}
				>
					{SITE_TITLE.toUpperCase()}
				</div>
			</div>
			{cover ? (
				<div style={{ alignItems: 'center', display: 'flex' }}>
					{/* A hairline frame, as box model rather than a border: dark art on a dark card vanishes without one */}
					<div
						style={{
							backgroundColor: COLOR_COVER_FRAME,
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
