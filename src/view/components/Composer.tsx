import { KeyboardEvent, useLayoutEffect, useRef, useState } from "react";

/** Auto-growing Markdown textarea; Cmd/Ctrl-Enter submits, Esc cancels. */
export function Composer({
	placeholder,
	initial = "",
	autoFocus = false,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	placeholder: string;
	initial?: string;
	autoFocus?: boolean;
	submitLabel: string;
	onSubmit: (body: string) => void;
	onCancel?: () => void;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const [value, setValue] = useState(initial);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.setCssProps({ height: "auto" });
		el.setCssProps({ height: `${el.scrollHeight}px` });
	}, [value]);

	const submit = () => {
		const body = value.trim();
		if (!body) return;
		onSubmit(body);
		setValue("");
	};

	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		// The feed's own hotkeys must never fire while writing.
		e.stopPropagation();
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			submit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			if (onCancel) onCancel();
			else ref.current?.blur();
		}
	};

	return (
		<div className={value.trim() ? "ripple-composer is-armed" : "ripple-composer"}>
			<textarea
				ref={ref}
				rows={1}
				value={value}
				placeholder={placeholder}
				autoFocus={autoFocus}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={onKeyDown}
			/>
			<div className="ripple-composer-actions">
				{onCancel && (
					<button onClick={onCancel}>Cancel</button>
				)}
				<button className="mod-cta" disabled={!value.trim()} onClick={submit}>
					{submitLabel}
				</button>
			</div>
		</div>
	);
}
