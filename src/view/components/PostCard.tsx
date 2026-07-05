import { Thread } from "../../types";
import { timeLabel } from "../../services/journal-model";
import { MarkdownPane } from "./MarkdownPane";
import { TagChip } from "./TagChip";

export function PostCard({
	thread,
	onTagClick,
}: {
	thread: Thread;
	onTagClick: (tag: string) => void;
}) {
	const { root, replies } = thread;
	return (
		<article className="ripple-post">
			<MarkdownPane path={root.path} mtime={root.mtime} />
			<footer className="ripple-post-meta">
				<span className="ripple-post-time">{timeLabel(root.created, Date.now())}</span>
				{root.tags.map((tag) => (
					<TagChip key={tag} tag={tag} onClick={onTagClick} />
				))}
				{replies.length > 0 && (
					<span className="ripple-post-replies">
						{replies.length === 1 ? "1 reply" : `${replies.length} replies`}
					</span>
				)}
			</footer>
		</article>
	);
}
