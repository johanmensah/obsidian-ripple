import { setIcon } from "obsidian";
import { useLayoutEffect, useRef } from "react";

export function Icon({ name, className }: { name: string; className?: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		if (ref.current) setIcon(ref.current, name);
	}, [name]);
	return <span ref={ref} className={className} />;
}
