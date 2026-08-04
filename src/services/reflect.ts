import { waitForAI } from "@obsidian-ai-providers/sdk";
import type { IAIProvider, IAIProvidersService } from "@obsidian-ai-providers/sdk";
import { App } from "obsidian";
import { ReflectionScope, Thread } from "../types";
import { splitFrontmatter } from "./post-io";

const WAIT_MS = 3000;

/** Resolves when AI Providers is ready, including when it loads after Ripple. */
export async function waitForAIReady(): Promise<IAIProvidersService> {
	const resolver = await waitForAI();
	return resolver.promise;
}

/** Resolves the AI Providers service, or null when the plugin is absent. */
export async function getAI(): Promise<IAIProvidersService | null> {
	let timeout: number | undefined;
	try {
		return await Promise.race([
			waitForAIReady(),
			new Promise<null>((resolve) => {
				timeout = window.setTimeout(() => resolve(null), WAIT_MS);
			}),
		]);
	} catch (err) {
		console.error("Ripple: AI Providers unavailable", err);
		return null;
	} finally {
		if (timeout !== undefined) window.clearTimeout(timeout);
	}
}

/** Builds a note-only, visual-through-here, branch, or whole-thread prompt. */
export async function reflectionText(
	app: App,
	thread: Thread,
	targetPath: string,
	scope: ReflectionScope,
): Promise<string> {
	const visualOrder = [thread.root, ...thread.replies];
	const targetIndex = visualOrder.findIndex((post) => post.path === targetPath);
	const target = visualOrder[targetIndex];
	if (!target) throw new Error(`Ripple: reflection target left its thread: ${targetPath}`);
	const byPath = new Map(visualOrder.map((post) => [post.path, post]));
	const branchPosts: typeof visualOrder = [];
	if (scope === "branch") {
		const visited = new Set<string>();
		let current: (typeof visualOrder)[number] | undefined = target;
		while (current && !visited.has(current.path)) {
			visited.add(current.path);
			branchPosts.unshift(current);
			current = current.replyTo ? byPath.get(current.replyTo) : undefined;
		}
	}
	const posts =
		scope === "note"
			? [target]
			: scope === "whole"
				? visualOrder
				: scope === "branch"
					? branchPosts
					: visualOrder.slice(0, targetIndex + 1);
	const numberByPath = new Map(posts.map((post, index) => [post.path, index + 1]));
	const heading =
		scope === "note"
			? "Reflect on this note:"
			: scope === "whole"
				? "Reflect on this whole thread:"
				: scope === "branch"
					? "Reflect on this branch:"
					: "Reflect on this thread through the selected note:";
	const sections = await Promise.all(
		posts.map(async (post, index) => {
			const file = app.vault.getFileByPath(post.path);
			if (!file) throw new Error(`Ripple: reflection source disappeared: ${post.path}`);
			const body = splitFrontmatter(
				app,
				file,
				await app.vault.cachedRead(file),
			).body.trim();
			const content = body || "(Empty note)";
			const selected = post.path === targetPath ? "Selected " : "";
			const timestamp = new Date(post.created).toLocaleString("en-GB", {
				day: "numeric",
				month: "long",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
			if (post.path === thread.root.path) {
				return `Note ${index + 1} — ${selected}journal entry (${timestamp}):\n\n${content}`;
			}
			const kind = post.ai ? "reflection" : "reply";
			const parentNumber = post.replyTo ? numberByPath.get(post.replyTo) : undefined;
			const relationship = parentNumber
				? `${post.ai ? " on" : " to"} note ${parentNumber}`
				: "";
			return `Note ${index + 1} — ${selected}${kind}${relationship} (${timestamp}):\n\n${content}`;
		}),
	);
	return [heading, ...sections].join("\n\n");
}

/** Streams a reflection; resolves with the final text, rejects on error or abort. */
export function reflect(params: {
	ai: IAIProvidersService;
	provider: IAIProvider;
	systemPrompt: string;
	prompt: string;
	onProgress: (accumulated: string) => void;
	abortController: AbortController;
}): Promise<string> {
	return params.ai.execute({
		provider: params.provider,
		prompt: params.prompt,
		systemPrompt: params.systemPrompt,
		onProgress: (_chunk, accumulated) => params.onProgress(accumulated),
		abortController: params.abortController,
	});
}
