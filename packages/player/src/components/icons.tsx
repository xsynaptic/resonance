import type { SVGProps } from 'react';

export function CloseIcon() {
	return (
		<Icon>
			<path d="M6 6l12 12M18 6 6 18" />
		</Icon>
	);
}

export function DragHandleIcon() {
	return (
		<Icon height="16" width="16">
			<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
		</Icon>
	);
}

export function NextIcon() {
	return (
		<Icon fill="currentColor" stroke="none">
			<path d="M15 5h2v14h-2zM4 5l11 7L4 19z" />
		</Icon>
	);
}

export function PauseIcon() {
	return (
		<Icon fill="currentColor" stroke="none">
			<path d="M6 5h4v14H6zM14 5h4v14h-4z" />
		</Icon>
	);
}

export function PlayIcon() {
	return (
		<Icon fill="currentColor" stroke="none">
			<path d="M8 5v14l11-7z" />
		</Icon>
	);
}

export function PlayingIcon() {
	return (
		<Icon height="14" width="14">
			<path d="M6 15v-6M12 19V5M18 16V8" />
		</Icon>
	);
}

export function PreviousIcon() {
	return (
		<Icon fill="currentColor" stroke="none">
			<path d="M7 5h2v14H7zM20 5v14L9 12z" />
		</Icon>
	);
}

export function QueueIcon() {
	return (
		<Icon>
			<path d="M4 6h16M4 12h16M4 18h10" />
		</Icon>
	);
}

export function ShuffleIcon() {
	return (
		<Icon>
			<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
		</Icon>
	);
}

export function SkipBackIcon({ seconds }: { seconds: number }) {
	return (
		<Icon>
			<path d="M12 6a7 7 0 1 0 7 7M15 3l-3 3 3 3" />
			<SkipCount seconds={seconds} />
		</Icon>
	);
}

export function SkipForwardIcon({ seconds }: { seconds: number }) {
	return (
		<Icon>
			<path d="M12 6a7 7 0 1 1-7 7M9 3l3 3-3 3" />
			<SkipCount seconds={seconds} />
		</Icon>
	);
}

// Sized to the status line beside it rather than to the transport
export function SkullIcon() {
	return (
		<Icon height="16" width="16">
			<path
				d="M12 1.5c-4.3 0-7.8 3.1-7.8 7 0 2.2 1.1 4.2 2.8 5.5v1.8A1.7 1.7 0 0 0 8.7 17.5h6.6a1.7 1.7 0 0 0 1.7-1.7v-1.8c1.7-1.3 2.8-3.3 2.8-5.5 0-3.9-3.5-7-7.8-7Zm-3 5.6a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Zm6 0a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Zm-3 5.5 1.3 2.4h-2.6L12 12.6Z"
				fill="currentColor"
				fillRule="evenodd"
				stroke="none"
			/>
			<path d="M5 18.6 19 22.5M19 18.6 5 22.5" strokeWidth="2.4" />
		</Icon>
	);
}

export function VolumeIcon() {
	return (
		<Icon>
			<path d="M11 5 6 9H2v6h4l5 4zM19 5a10 10 0 0 1 0 14M15.5 8.5a5 5 0 0 1 0 7" />
		</Icon>
	);
}

export function VolumeLowIcon() {
	return (
		<Icon>
			<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7" />
		</Icon>
	);
}

export function VolumeMutedIcon() {
	return (
		<Icon>
			<path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" />
		</Icon>
	);
}

export function WaveformIcon() {
	return (
		<Icon>
			<path d="M3 11v2M7 8v8M11 4v16M15 7v10M19 10v4" />
		</Icon>
	);
}

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="20"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="20"
			{...props}
		>
			{children}
		</svg>
	);
}

function SkipCount({ seconds }: { seconds: number }) {
	return (
		<text
			dominantBaseline="central"
			fill="currentColor"
			fontSize="9"
			stroke="none"
			textAnchor="middle"
			x="12"
			y="14"
		>
			{seconds}
		</text>
	);
}
