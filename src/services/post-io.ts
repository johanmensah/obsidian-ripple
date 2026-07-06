import { App, TFile, normalizePath } from "obsidian";
import { HighlightColour } from "../types";

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/**
 * Splits at the frontmatter boundary. The metadata cache decides what counts
 * as frontmatter, so a body that merely opens with a `---` rule is never
 * eaten; the regex is only a fallback while the cache has not indexed the
 * file yet.
 */
export function splitFrontmatter(
	app: App,
	file: TFile,
	text: string,
): { head: string; body: string } {
	const cache = app.metadataCache.getFileCache(file);
	if (cache) {
		const end = cache.frontmatterPosition?.end.offset;
		if (end === undefined) return { head: "", body: text };
		return { head: `${text.slice(0, end)}\n`, body: text.slice(end).replace(/^\r?\n/, "") };
	}
	const head = text.match(FRONTMATTER)?.[0] ?? "";
	return { head, body: text.slice(head.length) };
}

/** ISO 8601 with the local offset, per the frontmatter schema. */
export function isoLocal(d: Date): string {
	const offset = -d.getTimezoneOffset();
	const sign = offset >= 0 ? "+" : "-";
	const abs = Math.abs(offset);
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
		`T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
		`${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
	);
}

export function postPath(folder: string, d: Date): string {
	const stamp =
		`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
		`-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
	return normalizePath(`${folder}/${d.getFullYear()}/${pad(d.getMonth() + 1)}/${stamp}.md`);
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const parts = path.split("/");
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (!app.vault.getFolderByPath(current)) {
			// A folder appearing between check and create (sync, parallel writes) is benign.
			await app.vault.createFolder(current).catch(() => undefined);
		}
	}
}

/**
 * Frontmatter and body land in one vault.create: processFrontMatter on a file
 * the metadata cache has not seen yet is a race, so it is never used here.
 */
export async function createPost(
	app: App,
	folder: string,
	body: string,
	opts: { replyTo?: string; ai?: boolean } = {},
): Promise<TFile> {
	// Same-second collision: bump the moment until the path is free, so the
	// filename and the created stamp always agree.
	let moment = new Date();
	let path = postPath(folder, moment);
	for (let bump = 1; app.vault.getAbstractFileByPath(path) !== null && bump < 60; bump++) {
		moment = new Date(moment.getTime() + 1000);
		path = postPath(folder, moment);
	}
	await ensureFolder(app, path.slice(0, path.lastIndexOf("/")));
	const lines = ["---", `created: ${isoLocal(moment)}`];
	if (opts.replyTo) lines.push(`reply_to: "[[${opts.replyTo}]]"`);
	if (opts.ai) lines.push("ai: true");
	lines.push("---", "", body.trim(), "");
	return app.vault.create(path, lines.join("\n"));
}

/** Obsidian-safe basename: forbidden characters stripped, whitespace
 * collapsed, sensible length cap. Returns empty when nothing survives. */
export function sanitiseName(raw: string): string {
	return raw
		.replace(/[/\\:|#^[\]?]/gu, " ")
		.replace(/^\.+/u, "")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, 120)
		.trim();
}

/** A naming suggestion from the first words of the body. */
export function nameSuggestion(body: string): string {
	const firstLine = body
		.split("\n")
		.map((line) => line.replace(/^[#>\-*\s]+/u, "").trim())
		.find((line) => line.length > 0);
	if (!firstLine) return "";
	const words = firstLine.split(" ").slice(0, 8).join(" ");
	return sanitiseName(words.replace(/[.,;!?]+$/u, ""));
}

/** Renames within the post's folder; fileManager keeps reply_to links true. */
export async function renamePost(app: App, file: TFile, name: string): Promise<boolean> {
	const clean = sanitiseName(name);
	if (!clean || clean === file.basename) return false;
	const dir = file.parent?.path ?? "";
	const path = normalizePath(dir ? `${dir}/${clean}.md` : `${clean}.md`);
	if (app.vault.getAbstractFileByPath(path)) return false;
	await app.fileManager.renameFile(file, path);
	return true;
}

/** Replaces the body below the frontmatter block, then stamps `updated`. */
export async function saveEdit(app: App, file: TFile, body: string): Promise<void> {
	await app.vault.process(file, (text) => {
		const { head } = splitFrontmatter(app, file, text);
		return `${head}${body.trim()}\n`;
	});
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		fm.updated = isoLocal(new Date());
	});
}

export async function setHighlight(
	app: App,
	file: TFile,
	colour: HighlightColour | null,
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		if (colour) fm.highlight = colour;
		else delete fm.highlight;
	});
}
