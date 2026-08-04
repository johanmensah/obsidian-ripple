import { KeyboardEvent, useLayoutEffect, useRef, useState } from "react";

/** Auto-growing Markdown textarea; Enter submits, Shift-Enter adds a line. */
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
	onSubmit: (body: string) => boolean | Promise<boolean>;
	onCancel?: () => void;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const [value, setValue] = useState(initial);
	const [submitting, setSubmitting] = useState(false);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.setCssProps({ height: "auto" });
		el.setCssProps({ height: `${el.scrollHeight}px` });
	}, [value]);

	const submit = async () => {
		const body = value.trim();
		if (!body || submitting) return;
		setSubmitting(true);
		try {
			if (await onSubmit(body)) setValue("");
		} finally {
			setSubmitting(false);
		}
	};

	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		// The feed's own hotkeys must never fire while writing.
		e.stopPropagation();
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			if (!e.repeat) void submit();
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
				aria-label={placeholder || "Edit note"}
				enterKeyHint="send"
				autoFocus={autoFocus}
				disabled={submitting}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={onKeyDown}
			/>
			<div className="ripple-composer-actions">
				{onCancel && (
					<button disabled={submitting} onClick={onCancel}>
						Cancel
					</button>
				)}
				<button
					className="mod-cta"
					disabled={!value.trim() || submitting}
					onClick={() => void submit()}
				>
					{submitLabel}
				</button>
			</div>
		</div>
	);
}
