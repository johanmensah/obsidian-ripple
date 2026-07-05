import { waitForAI } from "@obsidian-ai-providers/sdk";
import type { IAIProvider, IAIProvidersService } from "@obsidian-ai-providers/sdk";
import { App } from "obsidian";
import { Thread } from "../types";
import { stripFrontmatter } from "./post-io";

const WAIT_MS = 3000;

/** Resolves the AI Providers service, or null when the plugin is absent. */
export async function getAI(): Promise<IAIProvidersService | null> {
	try {
		const resolver = await waitForAI();
		return await Promise.race([
			resolver.promise,
			new Promise<null>((resolve) =>
				window.setTimeout(() => {
					resolver.cancel();
					resolve(null);
				}, WAIT_MS),
			),
		]);
	} catch (err) {
		console.error("Ripple: AI Providers unavailable", err);
		return null;
	}
}

/** The whole thread as prompt text; nothing outside it ever leaves the vault. */
export async function threadText(app: App, thread: Thread): Promise<string> {
	const read = async (path: string) => {
		const file = app.vault.getFileByPath(path);
		return file ? stripFrontmatter(await app.vault.cachedRead(file)).trim() : "";
	};
	const date = new Date(thread.root.created).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	const parts = [`Journal entry (${date}):`, await read(thread.root.path)];
	for (const reply of thread.replies) {
		parts.push(reply.ai ? "An earlier reflection:" : "The writer added:");
		parts.push(await read(reply.path));
	}
	return parts.filter((p) => p.length > 0).join("\n\n");
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
