import { useSyncExternalStore } from "react";
import { groupByDay } from "../services/journal-model";
import { JournalStore } from "../services/journal-store";
import { PostCard } from "./components/PostCard";

export function FeedApp({ store }: { store: JournalStore }) {
	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const groups = groupByDay(snap.threads, Date.now());
	return (
		<div className="ripple-app">
			<div className="ripple-column">
				{groups.length === 0 && <div className="ripple-empty">Nothing here yet</div>}
				{groups.map((group) => (
					<section key={group.label} className="ripple-day">
						<h2 className="ripple-day-header">{group.label}</h2>
						{group.threads.map((thread) => (
							<PostCard
								key={thread.root.path}
								thread={thread}
								onTagClick={(tag) =>
									store.setTagFilter(snap.tagFilter === tag ? null : tag)
								}
							/>
						))}
					</section>
				))}
			</div>
		</div>
	);
}
