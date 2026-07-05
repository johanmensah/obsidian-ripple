import { useState, useSyncExternalStore } from "react";
import { MonthEntry } from "../../services/journal-model";
import { JournalStore } from "../../services/journal-store";
import { usePlugin } from "../context";
import { Icon } from "./Icon";

function Row({
	icon,
	label,
	count,
	active,
	onClick,
}: {
	icon: string;
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
}) {
	// Not a <button>: Obsidian's button:not(.clickable-icon) chrome outranks
	// single-class overrides, so a button can never render as a flat nav row.
	return (
		<div
			role="button"
			tabIndex={0}
			className={active ? "ripple-side-row is-active" : "ripple-side-row"}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
		>
			<Icon name={icon} className="ripple-side-icon" />
			<span className="ripple-side-label">{label}</span>
			{count > 0 && <span className="ripple-side-count">{count}</span>}
		</div>
	);
}

function monthLabel(entry: MonthEntry): string {
	return new Date(entry.year, entry.month - 1).toLocaleDateString("en-GB", { month: "long" });
}

export function Sidebar({ store }: { store: JournalStore }) {
	const plugin = usePlugin();
	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
		() => new Set(plugin.ui.collapsedYears ?? []),
	);
	// Every pick also makes sure a feed exists to show the result.
	const pick = (apply: () => void) => () => {
		apply();
		plugin.ensureJournalOpen();
	};
	const toggleYear = (year: string) => {
		const next = new Set(collapsed);
		if (next.has(year)) next.delete(year);
		else next.add(year);
		setCollapsed(next);
		plugin.ui.collapsedYears = [...next];
		void plugin.saveSettings();
	};

	const years: Array<{ year: string; months: MonthEntry[] }> = [];
	for (const entry of snap.months) {
		const year = String(entry.year);
		const bucket = years.find((y) => y.year === year);
		if (bucket) bucket.months.push(entry);
		else years.push({ year, months: [entry] });
	}

	return (
		<div className="ripple-sidebar">
			<Row
				icon="notebook-pen"
				label="Timeline"
				count={snap.allCount}
				active={snap.monthFilter === null}
				onClick={pick(() => store.setMonthFilter(null))}
			/>
			{years.map(({ year, months }) => (
				<div key={year}>
					<div
						role="button"
						tabIndex={0}
						className="ripple-side-heading ripple-side-year"
						onClick={() => toggleYear(year)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								toggleYear(year);
							}
						}}
					>
						<Icon
							name={collapsed.has(year) ? "chevron-right" : "chevron-down"}
							className="ripple-side-chevron"
						/>
						{year}
					</div>
					{!collapsed.has(year) &&
						months.map((entry) => (
							<Row
								key={entry.key}
								icon="calendar"
								label={monthLabel(entry)}
								count={entry.count}
								active={snap.monthFilter === entry.key}
								onClick={pick(() =>
									store.setMonthFilter(snap.monthFilter === entry.key ? null : entry.key),
								)}
							/>
						))}
				</div>
			))}
			{snap.tagEntries.length > 0 && <div className="ripple-side-heading">Tags</div>}
			{snap.tagEntries.map(({ tag, count }) => (
				<Row
					key={tag}
					icon="tag"
					label={tag}
					count={count}
					active={snap.tagFilter === tag}
					onClick={pick(() => store.setTagFilter(snap.tagFilter === tag ? null : tag))}
				/>
			))}
		</div>
	);
}
