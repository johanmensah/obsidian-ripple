import { Menu } from "obsidian";
import { MouseEvent } from "react";
import { timeLabel } from "../../services/journal-model";
import { Post } from "../../types";
import { Composer } from "./Composer";
import { Icon } from "./Icon";
import { MarkdownPane } from "./MarkdownPane";

function ReplyCard({
	reply,
	onOpen,
	onDelete,
}: {
	reply: Post;
	onOpen: (path: string) => void;
	onDelete: (path: string) => void;
}) {
	const showMenu = (e: MouseEvent) => {
		e.stopPropagation();
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle("Open as note").setIcon("file-symlink").onClick(() => onOpen(reply.path)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Delete")
				.setIcon("trash-2")
				.setWarning(true)
				.onClick(() => onDelete(reply.path)),
		);
		menu.showAtMouseEvent(e.nativeEvent);
	};

	return (
		<div className={reply.ai ? "ripple-reply is-ai" : "ripple-reply"}>
			<div className="ripple-reply-byline">
				{reply.ai && (
					<span className="ripple-reply-ai">
						<Icon name="sparkles" className="ripple-reply-ai-icon" />
						Reflection
					</span>
				)}
				<span className="ripple-post-time">{timeLabel(reply.created, Date.now())}</span>
				<button
					className="clickable-icon ripple-post-menu"
					aria-label="Reply actions"
					onClick={showMenu}
				>
					<Icon name="more-horizontal" />
				</button>
			</div>
			<MarkdownPane path={reply.path} mtime={reply.mtime} />
		</div>
	);
}

export function ThreadedReplies({
	replies,
	replying,
	onReplySubmit,
	onReplyCancel,
	onOpen,
	onDelete,
}: {
	replies: Post[];
	replying: boolean;
	onReplySubmit: (body: string) => void;
	onReplyCancel: () => void;
	onOpen: (path: string) => void;
	onDelete: (path: string) => void;
}) {
	return (
		<div className="ripple-thread">
			{replies.map((reply) => (
				<ReplyCard key={reply.path} reply={reply} onOpen={onOpen} onDelete={onDelete} />
			))}
			{replying && (
				<Composer
					placeholder="Reply…"
					autoFocus
					submitLabel="Reply"
					onSubmit={onReplySubmit}
					onCancel={onReplyCancel}
				/>
			)}
		</div>
	);
}
