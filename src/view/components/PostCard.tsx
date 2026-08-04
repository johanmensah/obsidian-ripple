import { useState } from "react";
import { mostRecentPost, timeLabel } from "../../services/journal-model";
import { HighlightColour, Post, ReflectionScope, Thread } from "../../types";
import { EditBody } from "./EditBody";
import { MarkdownPane } from "./MarkdownPane";
import { CollapseToggle, PostMenuButton, ThreadActionRow } from "./PostControls";
import { TagChip } from "./TagChip";
import { ThreadedReplies } from "./ThreadedReplies";

function sideBranchHiddenCount(originPath: string, replies: Post[]): number {
	const children = new Map<string, Post[]>();
	for (const reply of replies) {
		if (!reply.replyTo) continue;
		const siblings = children.get(reply.replyTo) ?? [];
		siblings.push(reply);
		children.set(reply.replyTo, siblings);
	}
	for (const siblings of children.values()) {
		siblings.sort((a, b) => b.created - a.created || b.path.localeCompare(a.path));
	}
	const countSubtree = (path: string, visited: Set<string>): number => {
		if (visited.has(path)) return 0;
		const nextVisited = new Set(visited).add(path);
		let count = 1;
		for (const child of children.get(path) ?? []) {
			count += countSubtree(child.path, nextVisited);
		}
		return count;
	};
	const siblings = children.get(originPath) ?? [];
	return siblings
		.slice(0, -1)
		.reduce((count, reply) => count + countSubtree(reply.path, new Set()), 0);
}

function sideBranchRoots(originPath: string, replies: Post[]): Post[] {
	return replies
		.filter((reply) => reply.replyTo === originPath)
		.sort((a, b) => b.created - a.created || b.path.localeCompare(a.path))
		.slice(0, -1);
}

export function PostCard({
	thread,
	isCursor,
	editingPath,
	replyingTo,
	onSelect,
	onTagClick,
	onRequestEdit,
	onRequestName,
	onEditDone,
	onRequestReply,
	onRequestExport,
	onRequestExportBranch,
	onReplySubmit,
	onReplyCancel,
	onSetHighlight,
	reflectEnabled,
	pendingReflection,
	onRequestReflect,
	onStopReflection,
	onPromotePath,
	onOpenPath,
	onDeleteThread,
	onDeletePath,
}: {
	thread: Thread;
	isCursor: boolean;
	editingPath: string | null;
	replyingTo: string | null;
	onSelect: () => void;
	onTagClick: (tag: string) => void;
	onRequestEdit: (path: string) => void;
	onRequestName: (path: string) => void;
	onEditDone: (path: string, body: string | null) => boolean | Promise<boolean>;
	onRequestReply: (path: string) => void;
	onRequestExport: (
		visiblePaths: readonly string[],
		depths: ReadonlyMap<string, number>,
	) => void;
	onRequestExportBranch: (
		path: string,
		visiblePaths: readonly string[],
		depths: ReadonlyMap<string, number>,
	) => void;
	onReplySubmit: (body: string) => boolean | Promise<boolean>;
	onReplyCancel: () => void;
	onSetHighlight: (path: string, colour: HighlightColour | null) => void;
	reflectEnabled: boolean;
	pendingReflection: { targetPath: string; providerName: string; text: string } | null;
	onRequestReflect: (path: string, scope: ReflectionScope) => void;
	onStopReflection: () => void;
	onPromotePath: (path: string) => void;
	onOpenPath: (path: string) => void;
	onDeleteThread: () => void;
	onDeletePath: (path: string) => void;
}) {
	const { root, replies } = thread;
	const latest = mostRecentPost(thread);
	const last = replies[replies.length - 1] ?? root;
	const rootIsLatest = latest.path === root.path;
	const rootIsEditing = editingPath === root.path;
	const hasThread = replies.length > 0 || replyingTo !== null || pendingReflection !== null;
	const [collapsedBranchOrigins, setCollapsedBranchOrigins] = useState<Set<string>>(
		() => new Set(),
	);
	const [rootSubtreeCollapsed, setRootSubtreeCollapsed] = useState(false);
	const [flattenedBranch, setFlattenedBranch] = useState<{
		originPath: string;
		branchRootPath: string;
	} | null>(null);
	const toggleBranchOrigin = (path: string) => {
		setCollapsedBranchOrigins((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};
	const revealBranchOrigin = (path: string) => {
		setCollapsedBranchOrigins((current) => {
			if (!current.has(path)) return current;
			const next = new Set(current);
			next.delete(path);
			return next;
		});
	};
	const rootHiddenCount = sideBranchHiddenCount(root.path, replies);
	const rootControlsFork = rootHiddenCount > 0;
	const rootBranchCollapsed = collapsedBranchOrigins.has(root.path);
	const rootCollapsed = rootSubtreeCollapsed || rootBranchCollapsed;
	const rootCollapseCount = rootSubtreeCollapsed
		? replies.length
		: rootControlsFork
			? rootHiddenCount
			: replies.length;
	const rootFlattenBranches = sideBranchRoots(root.path, replies).map((branchRoot) => ({
		title: `Flatten branch from ${timeLabel(branchRoot.created, Date.now())}`,
		active:
			flattenedBranch?.originPath === root.path &&
			flattenedBranch.branchRootPath === branchRoot.path,
		onClick: () => {
			revealBranchOrigin(root.path);
			setRootSubtreeCollapsed(false);
			setFlattenedBranch((current) =>
				current?.originPath === root.path && current.branchRootPath === branchRoot.path
					? null
					: { originPath: root.path, branchRootPath: branchRoot.path },
			);
		},
	}));
	const rootBranchToggle =
		rootHiddenCount > 0 || replies.length > 0
			? {
					collapsed: rootCollapsed,
					hiddenCount: rootCollapseCount,
					onToggle: () => {
						if (rootSubtreeCollapsed) setRootSubtreeCollapsed(false);
						else if (rootControlsFork) toggleBranchOrigin(root.path);
						else setRootSubtreeCollapsed((collapsed) => !collapsed);
					},
				}
			: undefined;
	const rootBranchMenuToggle: CollapseToggle | undefined = rootControlsFork
		? {
				collapsed: rootBranchCollapsed,
				hiddenCount: rootHiddenCount,
				onToggle: () => toggleBranchOrigin(root.path),
			}
		: undefined;
	const rootSubtreeToggle: CollapseToggle | undefined =
		replies.length > 0
			? {
					collapsed: rootSubtreeCollapsed,
					hiddenCount: replies.length,
					onToggle: () => setRootSubtreeCollapsed((collapsed) => !collapsed),
				}
			: undefined;
	const requestRootReply = () => {
		revealBranchOrigin(root.path);
		setRootSubtreeCollapsed(false);
		onRequestReply(root.path);
	};
	const requestRootReflection = () => {
		revealBranchOrigin(root.path);
		setRootSubtreeCollapsed(false);
		onRequestReflect(root.path, "note");
	};

	return (
		<article
			className={`ripple-post${isCursor ? " is-cursor" : ""}`}
			data-path={root.path}
			onClick={(e) => {
				// Interactive children own their clicks; the card handles its body.
				if (
					(e.target as HTMLElement).closest(
						"a, button, textarea, input, [contenteditable=true]",
					)
				)
					return;
				if (e.metaKey || e.ctrlKey) onOpenPath(root.path);
				else onSelect();
			}}
		>
			<div
				className={`ripple-row${rootIsLatest ? " is-latest" : ""}${
					root.highlight ? ` ripple-hl-${root.highlight}` : ""
				}`}
			>
				<div className="ripple-rail">
					{rootBranchToggle && !rootIsEditing ? (
						<button
							className={`ripple-branch-ball is-root${rootCollapsed ? " is-collapsed" : ""}`}
							aria-label={
								rootCollapsed
									? `Expand branch, ${rootCollapseCount} notes hidden`
									: "Collapse branch"
							}
							aria-expanded={!rootCollapsed}
							onClick={rootBranchToggle.onToggle}
						>
							<span className="ripple-ball" />
						</button>
					) : (
						<span className="ripple-ball" />
					)}
					{hasThread && <div className="ripple-line" />}
				</div>
				<div className="ripple-main">
					<header className="ripple-post-meta">
						<span className="ripple-post-time">{timeLabel(root.created, Date.now())}</span>
						{root.tags.map((tag) => (
							<TagChip key={tag} tag={tag} onClick={onTagClick} />
						))}
						{!rootIsEditing && (
							<PostMenuButton
								post={root}
								expanded={rootIsLatest}
								reflectEnabled={reflectEnabled}
								onReply={requestRootReply}
								onReflect={requestRootReflection}
								onEdit={() => onRequestEdit(root.path)}
								onName={() => onRequestName(root.path)}
								branchToggle={rootBranchMenuToggle}
								subtreeToggle={rootSubtreeToggle}
								flattenBranches={rootFlattenBranches}
								exportAction={
									last.path === root.path
										? {
												title: "Export thread as note",
												onClick: () =>
													onRequestExport([root.path], new Map([[root.path, 0]])),
											}
										: undefined
								}
								onSetHighlight={(colour) => onSetHighlight(root.path, colour)}
								onOpen={() => onOpenPath(root.path)}
								onDelete={() => onDeletePath(root.path)}
							/>
						)}
					</header>
					{rootIsEditing ? (
						<EditBody path={root.path} onDone={(body) => onEditDone(root.path, body)} />
					) : (
						<MarkdownPane path={root.path} mtime={root.mtime} />
					)}
					{!rootIsEditing && (
						<ThreadActionRow
							reflectEnabled={reflectEnabled}
							onReply={requestRootReply}
							onReflect={requestRootReflection}
							mobileReflect={last.path === root.path}
						/>
					)}
				</div>
			</div>
			{hasThread && (
				<ThreadedReplies
					rootPath={root.path}
					replies={replies}
					latestPath={latest.path}
					lastPath={last.path}
					collapsedBranchOrigins={collapsedBranchOrigins}
					rootSubtreeCollapsed={rootSubtreeCollapsed}
					flattenedBranch={flattenedBranch}
					replyingTo={replyingTo}
					pending={pendingReflection}
					editingPath={editingPath}
					onStopPending={onStopReflection}
					reflectEnabled={reflectEnabled}
					onRequestReply={onRequestReply}
					onRequestReflect={onRequestReflect}
					onRequestExport={onRequestExport}
					onRequestExportBranch={onRequestExportBranch}
					onRequestEdit={onRequestEdit}
					onRequestName={onRequestName}
					onPromote={onPromotePath}
					onEditDone={onEditDone}
					onSetHighlight={onSetHighlight}
					onReplySubmit={onReplySubmit}
					onReplyCancel={onReplyCancel}
					onOpen={onOpenPath}
					onDeleteThread={onDeleteThread}
					onDelete={onDeletePath}
					onToggleBranchOrigin={toggleBranchOrigin}
					onRevealBranchOrigin={revealBranchOrigin}
					onRevealRootSubtree={() => setRootSubtreeCollapsed(false)}
					onToggleFlattenBranch={(originPath, branchRootPath) => {
						setFlattenedBranch((current) =>
							current?.originPath === originPath &&
							current.branchRootPath === branchRootPath
								? null
								: { originPath, branchRootPath },
						);
					}}
				/>
			)}
		</article>
	);
}
