import { Menu } from "obsidian";
import { MouseEvent } from "react";
import { timeLabel } from "../../services/journal-model";
import { Post } from "../../types";
import { Composer } from "./Composer";
import { Icon } from "./Icon";
import { MarkdownPane } from "./MarkdownPane";

/** One rail cell: the line dropping in from the row above, a ball, and the
 * line onward when the thread continues below. */
function Rail({ ai, continues }: { ai: boolean; continues: boolean }) {
	return (
		<div className="ripple-rail">
			<div className={`ripple-line is-up${ai ? " is-dotted" : ""}`} />
			<span className={`ripple-ball is-small${ai ? " is-ai" : ""}`} />
			{continues && <div className="ripple-line" />}
		</div>
	);
}

function ReplyCard({
	reply,
	continues,
	onOpen,
	onDelete,
}: {
	reply: Post;
	continues: boolean;
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
		<div className={`ripple-row ripple-reply${reply.ai ? " is-ai" : ""}`}>
			<Rail ai={reply.ai} continues={continues} />
			<div className="ripple-main">
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
		</div>
	);
}

export function ThreadedReplies({
	replies,
	replying,
	pending,
	onStopPending,
	onReplySubmit,
	onReplyCancel,
	onOpen,
	onDelete,
}: {
	replies: Post[];
	replying: boolean;
	pending: { providerName: string; text: string } | null;
	onStopPending: () => void;
	onReplySubmit: (body: string) => void;
	onReplyCancel: () => void;
	onOpen: (path: string) => void;
	onDelete: (path: string) => void;
}) {
	const afterReplies = pending !== null || replying;
	return (
		<div className="ripple-thread">
			{replies.map((reply, i) => (
				<ReplyCard
					key={reply.path}
					reply={reply}
					continues={i < replies.length - 1 || afterReplies}
					onOpen={onOpen}
					onDelete={onDelete}
				/>
			))}
			{pending && (
				<div className="ripple-row ripple-reply is-ai is-pending">
					<div className="ripple-rail">
						<div className="ripple-line is-up is-dotted" />
						<span className="ripple-ball is-small is-ai is-pulse" />
						{replying && <div className="ripple-line" />}
					</div>
					<div className="ripple-main">
						<div className="ripple-reply-byline">
							<span className="ripple-reply-ai">
								<Icon name="sparkles" className="ripple-reply-ai-icon" />
								{pending.providerName}
							</span>
							<button
								className="clickable-icon ripple-pending-stop"
								aria-label="Stop the reflection"
								onClick={onStopPending}
							>
								<Icon name="square" />
							</button>
						</div>
						<div className="ripple-post-body ripple-pending-text">{pending.text || "…"}</div>
					</div>
				</div>
			)}
			{replying && (
				<div className="ripple-row ripple-reply-compose">
					<div className="ripple-rail">
						<div className="ripple-line is-up" />
						<span className="ripple-ball is-small is-hollow" />
					</div>
					<div className="ripple-main">
						<Composer
							placeholder="Reply…"
							autoFocus
							submitLabel="Reply"
							onSubmit={onReplySubmit}
							onCancel={onReplyCancel}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
