import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { timeLabel } from "../../services/journal-model";
import { HighlightColour, Post, ReflectionScope } from "../../types";
import { Composer } from "./Composer";
import { EditBody } from "./EditBody";
import { Icon } from "./Icon";
import { MarkdownPane } from "./MarkdownPane";
import {
	CollapseToggle,
	PostMenuButton,
	ThreadActionRow,
} from "./PostControls";

type LaneStyle = CSSProperties & { "--ripple-lane": number };
type GuideStyle = CSSProperties & { "--ripple-guide": number };
type ThreadStyle = CSSProperties & { "--ripple-mobile-branch-step": string };

interface LaneMeta {
	lane: number;
	guides: number[];
	isBranchRoot: boolean;
}

interface LaneModel {
	children: Map<string, Post[]>;
	parents: Map<string, string>;
	meta: Map<string, LaneMeta>;
	descendantCounts: Map<string, number>;
	sideBranchRoots: Map<string, string[]>;
	hiddenCounts: Map<string, number>;
}

function laneStyle(lane: number): LaneStyle {
	return { "--ripple-lane": lane };
}

function guideStyle(guide: number): GuideStyle {
	return { "--ripple-guide": guide };
}

/** A continuation stays on its parent's lane. A later sibling begins a new
 * lane, while the parent's lane remains visible beside that complete branch. */
function buildLaneModel(rootPath: string, replies: Post[]): LaneModel {
	const children = new Map<string, Post[]>();
	const parents = new Map<string, string>();
	for (const reply of replies) {
		if (!reply.replyTo) continue;
		const siblings = children.get(reply.replyTo) ?? [];
		siblings.push(reply);
		children.set(reply.replyTo, siblings);
		parents.set(reply.path, reply.replyTo);
	}
	for (const siblings of children.values()) {
		siblings.sort((a, b) => b.created - a.created || b.path.localeCompare(a.path));
	}

	const meta = new Map<string, LaneMeta>([
		[rootPath, { lane: 0, guides: [], isBranchRoot: false }],
	]);
	const visited = new Set<string>([rootPath]);
	const visit = (parentPath: string) => {
		const parentMeta = meta.get(parentPath) ?? {
			lane: 0,
			guides: [],
			isBranchRoot: false,
		};
		const siblings = children.get(parentPath) ?? [];
		const continuationPath = siblings[siblings.length - 1]?.path;
		for (const child of siblings) {
			if (visited.has(child.path)) continue;
			visited.add(child.path);
			const isBranchRoot = child.path !== continuationPath;
			meta.set(child.path, {
				lane: isBranchRoot ? parentMeta.lane + 1 : parentMeta.lane,
				guides: isBranchRoot
					? [...parentMeta.guides, parentMeta.lane]
					: parentMeta.guides,
				isBranchRoot,
			});
			visit(child.path);
		}
	};
	visit(rootPath);
	// Malformed cyclic links have no natural traversal root. Keep them visible
	// on the base lane rather than allowing layout recursion to hide a note.
	for (const reply of replies) {
		if (visited.has(reply.path)) continue;
		visited.add(reply.path);
		meta.set(reply.path, { lane: 0, guides: [], isBranchRoot: false });
		visit(reply.path);
	}

	const descendantCounts = new Map<string, number>();
	const countDescendants = (path: string, visiting: Set<string>): number => {
		const cached = descendantCounts.get(path);
		if (cached !== undefined) return cached;
		if (visiting.has(path)) return 0;
		const nextVisiting = new Set(visiting).add(path);
		let count = 0;
		for (const child of children.get(path) ?? []) {
			count += 1 + countDescendants(child.path, nextVisiting);
		}
		descendantCounts.set(path, count);
		return count;
	};
	countDescendants(rootPath, new Set());
	for (const reply of replies) countDescendants(reply.path, new Set());
	const sideBranchRoots = new Map<string, string[]>();
	const hiddenCounts = new Map<string, number>();
	for (const [parentPath, siblings] of children) {
		if (siblings.length < 2) continue;
		const branchRoots = siblings.slice(0, -1).map((reply) => reply.path);
		sideBranchRoots.set(parentPath, branchRoots);
		hiddenCounts.set(
			parentPath,
			branchRoots.reduce(
				(count, path) => count + 1 + (descendantCounts.get(path) ?? 0),
				0,
			),
		);
	}

	return { children, parents, meta, descendantCounts, sideBranchRoots, hiddenCounts };
}

function isDescendantOf(path: string, ancestorPath: string, parents: Map<string, string>): boolean {
	const visited = new Set<string>();
	let parent = parents.get(path);
	while (parent && !visited.has(parent)) {
		if (parent === ancestorPath) return true;
		visited.add(parent);
		parent = parents.get(parent);
	}
	return false;
}

function BranchRail({
	lane,
	guides,
	incoming,
	outgoing,
	ai,
	ballClass = "",
	branchToggle,
}: {
	lane: number;
	guides: number[];
	incoming: boolean;
	outgoing: boolean;
	ai: boolean;
	ballClass?: string;
	branchToggle?: { collapsed: boolean; hiddenCount: number; onToggle: () => void };
}) {
	const ball = (
		<span
			className={`ripple-ball is-small${ai ? " is-ai" : ""}${ballClass ? ` ${ballClass}` : ""}`}
		/>
	);
	return (
		<div className="ripple-branch-rail" style={laneStyle(lane)}>
			{guides.map((guide) => (
				<div key={guide} className="ripple-branch-guide" style={guideStyle(guide)} />
			))}
			{incoming && (
				<div className={`ripple-branch-line is-up${ai ? " is-dotted" : ""}`} />
			)}
			{branchToggle ? (
				<button
					className={`ripple-branch-ball${branchToggle.collapsed ? " is-collapsed" : ""}${ai ? " is-ai" : ""}`}
					aria-label={
						branchToggle.collapsed
							? `Expand branch, ${branchToggle.hiddenCount} notes hidden`
							: "Collapse branch"
					}
					aria-expanded={!branchToggle.collapsed}
					onClick={branchToggle.onToggle}
				>
					{ball}
				</button>
			) : (
				ball
			)}
			{outgoing && <div className="ripple-branch-line is-down" />}
		</div>
	);
}

function ReplyCard({
	reply,
	meta,
	outgoing,
	isLatest,
	isLast,
	isTerminal,
	isEditing,
	collapsed,
	hiddenCount,
	reflectEnabled,
	onToggleBranch,
	menuBranchToggle,
	subtreeToggle,
	flattenBranches,
	onRequestReply,
	onRequestReflect,
	onRequestExport,
	onRequestExportBranch,
	onRequestEdit,
	onRequestName,
	onPromote,
	onEditDone,
	onSetHighlight,
	onOpen,
	onDeleteThread,
	onDelete,
}: {
	reply: Post;
	meta: LaneMeta;
	outgoing: boolean;
	isLatest: boolean;
	isLast: boolean;
	isTerminal: boolean;
	isEditing: boolean;
	collapsed: boolean;
	hiddenCount: number;
	reflectEnabled: boolean;
	onToggleBranch: () => void;
	menuBranchToggle?: CollapseToggle;
	subtreeToggle?: CollapseToggle;
	flattenBranches?: Array<{ title: string; active: boolean; onClick: () => void }>;
	onRequestReply: () => void;
	onRequestReflect: (scope: ReflectionScope) => void;
	onRequestExport: () => void;
	onRequestExportBranch: () => void;
	onRequestEdit: (path: string) => void;
	onRequestName: (path: string) => void;
	onPromote: () => void;
	onEditDone: (path: string, body: string | null) => boolean | Promise<boolean>;
	onSetHighlight: (path: string, colour: HighlightColour | null) => void;
	onOpen: (path: string) => void;
	onDeleteThread?: () => void;
	onDelete: (path: string) => void;
}) {
	const requestNoteReflection = () => onRequestReflect("note");
	const requestThreadReflection = () =>
		onRequestReflect(isLast ? "whole" : isTerminal ? "branch" : "through");
	const branchToggle =
		hiddenCount > 0 ? { collapsed, hiddenCount, onToggle: onToggleBranch } : undefined;
	return (
		<div
			className={`ripple-row ripple-reply${isLatest ? " is-latest" : ""}${reply.ai ? " is-ai" : ""}${
				reply.highlight ? ` ripple-hl-${reply.highlight}` : ""
			}`}
			data-path={reply.path}
			onClick={(e) => {
				if (
					(e.target as HTMLElement).closest(
						"a, button, textarea, input, [contenteditable=true]",
					)
				)
					return;
				if (e.metaKey || e.ctrlKey) {
					e.stopPropagation();
					onOpen(reply.path);
				}
			}}
		>
			<BranchRail
				lane={meta.lane}
				guides={meta.guides}
				incoming={!meta.isBranchRoot}
				outgoing={outgoing}
				ai={reply.ai}
				branchToggle={isEditing ? undefined : branchToggle}
			/>
			<div className="ripple-main">
				<div className="ripple-reply-byline">
					{reply.ai && (
						<span className="ripple-reply-ai">
							<Icon name="sparkles" className="ripple-reply-ai-icon" />
							Reflection
						</span>
					)}
					<span className="ripple-post-time">{timeLabel(reply.created, Date.now())}</span>
					{!isEditing && (
						<PostMenuButton
							post={reply}
							expanded={isLatest}
							reflectEnabled={reflectEnabled}
							onReply={onRequestReply}
							onReflect={requestNoteReflection}
							threadReflection={{
								title: isLast
									? "Reflect on whole thread"
									: isTerminal
										? "Reflect on branch"
									: "Reflect on thread until this point",
								onClick: requestThreadReflection,
							}}
							exportAction={
								isLast
									? { title: "Export thread as note", onClick: onRequestExport }
									: isTerminal
										? { title: "Export branch as note", onClick: onRequestExportBranch }
										: undefined
							}
							onEdit={() => onRequestEdit(reply.path)}
							onName={() => onRequestName(reply.path)}
							onPromote={onPromote}
							branchToggle={menuBranchToggle}
							subtreeToggle={subtreeToggle}
							flattenBranches={flattenBranches}
							onSetHighlight={(colour) => onSetHighlight(reply.path, colour)}
							onOpen={() => onOpen(reply.path)}
							onDeleteThread={onDeleteThread}
							onDelete={() => onDelete(reply.path)}
						/>
					)}
				</div>
				{isEditing ? (
					<EditBody path={reply.path} onDone={(body) => onEditDone(reply.path, body)} />
				) : (
					<MarkdownPane path={reply.path} mtime={reply.mtime} />
				)}
				{!isEditing && (
					<ThreadActionRow
						reflectEnabled={reflectEnabled}
						onReply={onRequestReply}
						onReflect={requestNoteReflection}
						mobileReflect={isTerminal}
						onReflectThread={isTerminal ? requestThreadReflection : undefined}
						reflectThreadLabel={isLast ? "Reflect on whole thread" : "Reflect on branch"}
					/>
				)}
			</div>
		</div>
	);
}

export function ThreadedReplies({
	rootPath,
	replies,
	latestPath,
	lastPath,
	collapsedBranchOrigins,
	rootSubtreeCollapsed,
	flattenedBranch,
	replyingTo,
	pending,
	editingPath,
	onStopPending,
	reflectEnabled,
	onRequestReply,
	onRequestReflect,
	onRequestExport,
	onRequestExportBranch,
	onRequestEdit,
	onRequestName,
	onPromote,
	onEditDone,
	onSetHighlight,
	onReplySubmit,
	onReplyCancel,
	onOpen,
	onDeleteThread,
	onDelete,
	onToggleBranchOrigin,
	onRevealBranchOrigin,
	onRevealRootSubtree,
	onToggleFlattenBranch,
}: {
	rootPath: string;
	replies: Post[];
	latestPath: string;
	lastPath: string;
	collapsedBranchOrigins: ReadonlySet<string>;
	rootSubtreeCollapsed: boolean;
	flattenedBranch: { originPath: string; branchRootPath: string } | null;
	replyingTo: string | null;
	pending: { targetPath: string; providerName: string; text: string } | null;
	editingPath: string | null;
	onStopPending: () => void;
	reflectEnabled: boolean;
	onRequestReply: (path: string) => void;
	onRequestReflect: (path: string, scope: ReflectionScope) => void;
	onRequestExport: (
		visiblePaths: readonly string[],
		depths: ReadonlyMap<string, number>,
	) => void;
	onRequestExportBranch: (
		path: string,
		visiblePaths: readonly string[],
		depths: ReadonlyMap<string, number>,
	) => void;
	onRequestEdit: (path: string) => void;
	onRequestName: (path: string) => void;
	onPromote: (path: string) => void;
	onEditDone: (path: string, body: string | null) => boolean | Promise<boolean>;
	onSetHighlight: (path: string, colour: HighlightColour | null) => void;
	onReplySubmit: (body: string) => boolean | Promise<boolean>;
	onReplyCancel: () => void;
	onOpen: (path: string) => void;
	onDeleteThread: () => void;
	onDelete: (path: string) => void;
	onToggleBranchOrigin: (path: string) => void;
	onRevealBranchOrigin: (path: string) => void;
	onRevealRootSubtree: () => void;
	onToggleFlattenBranch: (originPath: string, branchRootPath: string) => void;
}) {
	const model = useMemo(() => buildLaneModel(rootPath, replies), [rootPath, replies]);
	const activeFlatten =
		flattenedBranch &&
		(model.sideBranchRoots.get(flattenedBranch.originPath) ?? []).includes(
			flattenedBranch.branchRootPath,
		)
			? flattenedBranch
			: null;
	const [collapsedBranchRoots, setCollapsedBranchRoots] = useState<Set<string>>(
		() => new Set(),
	);
	const [collapsedSubtrees, setCollapsedSubtrees] = useState<Set<string>>(() => new Set());
	const isHiddenByOrigin = (path: string, originPath: string) => {
		for (const branchRoot of model.sideBranchRoots.get(originPath) ?? []) {
			if (path === branchRoot || isDescendantOf(path, branchRoot, model.parents)) return true;
		}
		return false;
	};
	const isInFlattenedBranch = (path: string) =>
		activeFlatten !== null &&
		(path === activeFlatten.branchRootPath ||
			isDescendantOf(path, activeFlatten.branchRootPath, model.parents));
	const flattenLaneMeta = (meta: LaneMeta, makeContinuation: boolean): LaneMeta => {
		if (!activeFlatten) return meta;
		const originLane = model.meta.get(activeFlatten.originPath)?.lane ?? 0;
		let removedOriginGuide = false;
		const guides: number[] = [];
		for (const guide of meta.guides) {
			if (!removedOriginGuide && guide === originLane) {
				removedOriginGuide = true;
				continue;
			}
			guides.push(guide > originLane ? guide - 1 : guide);
		}
		return {
			lane: meta.lane > originLane ? meta.lane - 1 : meta.lane,
			guides,
			isBranchRoot: makeContinuation ? false : meta.isBranchRoot,
		};
	};
	const displayMeta = (path: string, meta: LaneMeta): LaneMeta =>
		isInFlattenedBranch(path)
			? flattenLaneMeta(meta, path === activeFlatten?.branchRootPath)
			: meta;
	const isHidden = (path: string) => {
		if (activeFlatten) {
			const siblings = model.children.get(activeFlatten.originPath) ?? [];
			const mainContinuation = siblings[siblings.length - 1];
			if (
				mainContinuation &&
				(path === mainContinuation.path ||
					isDescendantOf(path, mainContinuation.path, model.parents))
			) {
				return true;
			}
		}
		if (rootSubtreeCollapsed && isDescendantOf(path, rootPath, model.parents)) return true;
		for (const originPath of collapsedBranchOrigins) {
			if (isHiddenByOrigin(path, originPath)) return true;
		}
		for (const branchRoot of collapsedBranchRoots) {
			if (path !== branchRoot && isDescendantOf(path, branchRoot, model.parents)) return true;
		}
		for (const subtreeRoot of collapsedSubtrees) {
			if (path !== subtreeRoot && isDescendantOf(path, subtreeRoot, model.parents)) return true;
		}
		return false;
	};

	useEffect(() => {
		const activePaths = [replyingTo, pending?.targetPath ?? null, editingPath].filter(
			(path): path is string => path !== null,
		);
		if (activePaths.length === 0) return;
		if (
			rootSubtreeCollapsed &&
			activePaths.some(
				(path) => path === rootPath || isDescendantOf(path, rootPath, model.parents),
			)
		) {
			onRevealRootSubtree();
		}
		for (const originPath of collapsedBranchOrigins) {
			if (
				activePaths.some(
					(path) => path === originPath || isHiddenByOrigin(path, originPath),
				)
			) {
				onRevealBranchOrigin(originPath);
			}
		}
		setCollapsedBranchRoots((current) => {
			const next = new Set(current);
			for (const branchRoot of current) {
				if (
					activePaths.some(
						(path) =>
							path === branchRoot || isDescendantOf(path, branchRoot, model.parents),
					)
				) {
					next.delete(branchRoot);
				}
			}
			return next.size === current.size ? current : next;
		});
		setCollapsedSubtrees((current) => {
			const next = new Set(current);
			for (const subtreeRoot of current) {
				if (
					activePaths.some(
						(path) =>
							path === subtreeRoot || isDescendantOf(path, subtreeRoot, model.parents),
					)
				) {
					next.delete(subtreeRoot);
				}
			}
			return next.size === current.size ? current : next;
		});
	}, [
		collapsedBranchOrigins,
		editingPath,
		model,
		onRevealBranchOrigin,
		onRevealRootSubtree,
		pending?.targetPath,
		replyingTo,
		rootPath,
		rootSubtreeCollapsed,
	]);
	const toggleBranchRoot = (path: string) => {
		setCollapsedBranchRoots((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};
	const revealBranchRoot = (path: string) => {
		setCollapsedBranchRoots((current) => {
			if (!current.has(path)) return current;
			const next = new Set(current);
			next.delete(path);
			return next;
		});
	};
	const toggleSubtree = (path: string) => {
		setCollapsedSubtrees((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};
	const revealSubtree = (path: string) => {
		setCollapsedSubtrees((current) => {
			if (!current.has(path)) return current;
			const next = new Set(current);
			next.delete(path);
			return next;
		});
	};

	const childIsHidden = (parentPath: string) =>
		isHidden(parentPath) ||
		(parentPath === rootPath && rootSubtreeCollapsed) ||
		collapsedBranchRoots.has(parentPath) ||
		collapsedSubtrees.has(parentPath) ||
		(collapsedBranchOrigins.has(parentPath) &&
			(model.children.get(parentPath)?.length ?? 0) > 0);
	const childMeta = (parentPath: string): LaneMeta => {
		const parentMeta = model.meta.get(parentPath) ?? {
			lane: 0,
			guides: [],
			isBranchRoot: false,
		};
		const isBranchRoot = (model.children.get(parentPath)?.length ?? 0) > 0;
		const meta = {
			lane: isBranchRoot ? parentMeta.lane + 1 : parentMeta.lane,
			guides: isBranchRoot
				? [...parentMeta.guides, parentMeta.lane]
				: parentMeta.guides,
			isBranchRoot,
		};
		return isInFlattenedBranch(parentPath) ? flattenLaneMeta(meta, false) : meta;
	};
	const insertionIndex = (parentPath: string) => {
		if (parentPath === rootPath) return 0;
		const parentIndex = replies.findIndex((reply) => reply.path === parentPath);
		return parentIndex < 0 ? replies.length : parentIndex + 1;
	};
	type Row =
		| { kind: "reply"; post: Post }
		| { kind: "pending"; targetPath: string; providerName: string; text: string }
		| { kind: "composer"; targetPath: string };
	const rows: Row[] = [];
	const pendingIndex = pending ? insertionIndex(pending.targetPath) : -1;
	const composerIndex = replyingTo ? insertionIndex(replyingTo) : -1;
	for (let index = 0; index <= replies.length; index++) {
		if (pending && index === pendingIndex) {
			rows.push({
				kind: "pending",
				targetPath: pending.targetPath,
				providerName: pending.providerName,
				text: pending.text,
			});
		}
		if (replyingTo && index === composerIndex) {
			rows.push({ kind: "composer", targetPath: replyingTo });
		}
		const reply = replies[index];
		if (reply) rows.push({ kind: "reply", post: reply });
	}

	let maxLane = 0;
	for (const meta of model.meta.values()) maxLane = Math.max(maxLane, meta.lane);
	if (pending) maxLane = Math.max(maxLane, childMeta(pending.targetPath).lane);
	if (replyingTo) maxLane = Math.max(maxLane, childMeta(replyingTo).lane);
	const threadStyle: ThreadStyle = {
		"--ripple-mobile-branch-step": `${Math.max(6, Math.min(12, 48 / Math.max(1, maxLane)))}px`,
	};
	const visiblePaths = [
		rootPath,
		...replies.filter((reply) => !isHidden(reply.path)).map((reply) => reply.path),
	];
	const exportDepths = new Map<string, number>([[rootPath, 0]]);
	for (const reply of replies) {
		exportDepths.set(reply.path, model.meta.get(reply.path)?.lane ?? 0);
	}

	return (
		<div className="ripple-thread" style={threadStyle}>
			{rows.map((row) => {
				if (row.kind === "reply") {
					const reply = row.post;
					if (isHidden(reply.path)) return null;
					const semanticMeta = model.meta.get(reply.path) ?? {
						lane: 0,
						guides: [],
						isBranchRoot: false,
					};
					const meta = displayMeta(reply.path, semanticMeta);
					const descendantCount = model.descendantCounts.get(reply.path) ?? 0;
					const controlsOwnBranch = semanticMeta.isBranchRoot && descendantCount > 0;
					const controlsFork = !controlsOwnBranch && (model.hiddenCounts.get(reply.path) ?? 0) > 0;
					const controlsSubtree = !controlsOwnBranch && !controlsFork && descendantCount > 0;
					const branchRootCollapsed = collapsedBranchRoots.has(reply.path);
					const branchOriginCollapsed = collapsedBranchOrigins.has(reply.path);
					const subtreeCollapsed = collapsedSubtrees.has(reply.path);
					const collapsed = controlsOwnBranch
						? branchRootCollapsed
						: controlsFork
							? branchOriginCollapsed || subtreeCollapsed
							: subtreeCollapsed;
					const hiddenCount = controlsOwnBranch
						? descendantCount
						: controlsFork
							? subtreeCollapsed
								? descendantCount
								: (model.hiddenCounts.get(reply.path) ?? 0)
							: controlsSubtree
								? descendantCount
								: 0;
					const menuBranchToggle: CollapseToggle | undefined = controlsOwnBranch
						? {
								collapsed: branchRootCollapsed,
								hiddenCount: descendantCount,
								onToggle: () => toggleBranchRoot(reply.path),
							}
						: controlsFork
							? {
									collapsed: branchOriginCollapsed,
									hiddenCount: model.hiddenCounts.get(reply.path) ?? 0,
									onToggle: () => onToggleBranchOrigin(reply.path),
								}
							: undefined;
					const subtreeToggle: CollapseToggle | undefined =
						!controlsOwnBranch && descendantCount > 0
							? {
									collapsed: subtreeCollapsed,
									hiddenCount: descendantCount,
									onToggle: () => toggleSubtree(reply.path),
								}
							: undefined;
					const flattenBranches = (model.sideBranchRoots.get(reply.path) ?? []).map(
						(branchRootPath) => {
							const branchRoot = replies.find((candidate) => candidate.path === branchRootPath);
							return {
								title: `Flatten branch from ${branchRoot ? timeLabel(branchRoot.created, Date.now()) : "reply"}`,
								active:
									activeFlatten?.originPath === reply.path &&
									activeFlatten.branchRootPath === branchRootPath,
								onClick: () => {
									revealBranchRoot(reply.path);
									revealSubtree(reply.path);
									onRevealBranchOrigin(reply.path);
									onToggleFlattenBranch(reply.path, branchRootPath);
								},
							};
						},
					);
					return (
						<ReplyCard
							key={reply.path}
							reply={reply}
							meta={meta}
							outgoing={
								(model.children.get(reply.path)?.length ?? 0) > 0 &&
								!collapsedBranchRoots.has(reply.path) &&
								!collapsedSubtrees.has(reply.path)
							}
							isLatest={reply.path === latestPath}
							isLast={reply.path === lastPath}
							isTerminal={(model.children.get(reply.path)?.length ?? 0) === 0}
							isEditing={editingPath === reply.path}
							collapsed={collapsed}
							hiddenCount={hiddenCount}
							reflectEnabled={reflectEnabled}
							onToggleBranch={() =>
								controlsOwnBranch
									? toggleBranchRoot(reply.path)
									: controlsFork
										? subtreeCollapsed
											? toggleSubtree(reply.path)
											: onToggleBranchOrigin(reply.path)
										: toggleSubtree(reply.path)
							}
							menuBranchToggle={menuBranchToggle}
							subtreeToggle={subtreeToggle}
							flattenBranches={flattenBranches}
							onRequestReply={() => {
								revealBranchRoot(reply.path);
								revealSubtree(reply.path);
								onRevealBranchOrigin(reply.path);
								onRequestReply(reply.path);
							}}
							onRequestReflect={(scope) => {
								revealBranchRoot(reply.path);
								revealSubtree(reply.path);
								onRevealBranchOrigin(reply.path);
								onRequestReflect(reply.path, scope);
							}}
							onRequestExport={() => onRequestExport(visiblePaths, exportDepths)}
							onRequestExportBranch={() =>
								onRequestExportBranch(reply.path, visiblePaths, exportDepths)
							}
							onRequestEdit={onRequestEdit}
							onRequestName={onRequestName}
							onPromote={() => onPromote(reply.path)}
							onEditDone={onEditDone}
							onSetHighlight={onSetHighlight}
							onOpen={onOpen}
							onDeleteThread={reply.path === lastPath ? onDeleteThread : undefined}
							onDelete={onDelete}
						/>
					);
				}
				if (childIsHidden(row.targetPath)) return null;
				const meta = childMeta(row.targetPath);
				if (row.kind === "pending") {
					return (
						<div key="pending" className="ripple-row ripple-reply is-ai is-pending">
							<BranchRail
								lane={meta.lane}
								guides={meta.guides}
								incoming={!meta.isBranchRoot}
								outgoing={false}
								ai
								ballClass="is-pulse"
							/>
							<div className="ripple-main">
								<div className="ripple-reply-byline">
									<span className="ripple-reply-ai">
										<Icon name="sparkles" className="ripple-reply-ai-icon" />
										{row.providerName}
									</span>
									<button
										className="clickable-icon ripple-pending-stop"
										aria-label="Stop the reflection"
										onClick={onStopPending}
									>
										<Icon name="square" />
									</button>
								</div>
								<div className="ripple-post-body ripple-pending-text">
									{row.text || "…"}
								</div>
							</div>
						</div>
					);
				}
				return (
					<div key={`composer:${row.targetPath}`} className="ripple-row ripple-reply-compose">
						<BranchRail
							lane={meta.lane}
							guides={meta.guides}
							incoming={!meta.isBranchRoot}
							outgoing={false}
							ai={false}
							ballClass="is-hollow"
						/>
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
				);
			})}
		</div>
	);
}
