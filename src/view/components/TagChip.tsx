import { CSSProperties } from "react";

function hueOf(text: string): number {
	let hash = 5381;
	for (let i = 0; i < text.length; i++) {
		hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
	}
	return ((hash % 360) + 360) % 360;
}

// Spans, not <button>s: Obsidian's button chrome outranks the chip tint.
export function TagChip({ tag, onClick }: { tag: string; onClick?: (tag: string) => void }) {
	return (
		<span
			role="button"
			className="ripple-tag-chip"
			style={{ "--ripple-tag-hue": String(hueOf(tag)) } as CSSProperties}
			onClick={(e) => {
				e.stopPropagation();
				onClick?.(tag);
			}}
		>
			{tag}
		</span>
	);
}
