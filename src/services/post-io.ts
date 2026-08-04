import { App, TFile, moment, normalizePath } from "obsidian";
import { HighlightColour, Thread } from "../types";

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
			try {
				await app.vault.createFolder(current);
			} catch (err) {
				if (!app.vault.getFolderByPath(current)) throw err;
			}
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
	opts: { replyTo?: TFile; ai?: boolean } = {},
): Promise<TFile> {
	let created = new Date();
	for (;;) {
		const path = postPath(folder, created);
		if (app.vault.getAbstractFileByPath(path) !== null) {
			created = new Date(created.getTime() + 1000);
			continue;
		}
		await ensureFolder(app, path.slice(0, path.lastIndexOf("/")));
		const lines = ["---", `created: ${isoLocal(created)}`];
		if (opts.replyTo) {
			const linktext = app.metadataCache.fileToLinktext(opts.replyTo, path, true);
			lines.push(`reply_to: ${JSON.stringify(`[[${linktext}]]`)}`);
		}
		if (opts.ai) lines.push("ai: true");
		lines.push("---", "", body.trim(), "");
		try {
			return await app.vault.create(path, lines.join("\n"));
		} catch (err) {
			if (app.vault.getAbstractFileByPath(path) === null) throw err;
			created = new Date(created.getTime() + 1000);
		}
	}
}

/** Obsidian-safe basename: forbidden characters stripped, whitespace
 * collapsed, sensible length cap. Returns empty when nothing survives. */
export function sanitiseName(raw: string): string {
	let clean = raw
		.replace(/[*/\\:"<>|#^[\]?]/gu, " ")
		.replace(/\p{Cc}/gu, " ")
		.replace(/^\.+/u, "")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, 120)
		.replace(/[ .]+$/u, "");
	if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(clean)) {
		clean = `_${clean}`.slice(0, 120).replace(/[ .]+$/u, "");
	}
	return clean;
}

/** A naming suggestion: the first sentence of the body, capped at 8 words. */
export function nameSuggestion(body: string): string {
	const firstLine = body
		.split("\n")
		.map((line) => line.replace(/^[#>\-*\s]+/u, "").trim())
		.find((line) => line.length > 0);
	if (!firstLine) return "";
	// No lookbehind: unsupported on iOS WebKit before 16.4.
	const end = /[.!?]\s/u.exec(firstLine);
	const sentence = end ? firstLine.slice(0, end.index + 1) : firstLine;
	const words = sentence.split(" ").slice(0, 8).join(" ");
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

/** Makes a reply top-level; descendants remain linked to it. */
export async function promotePost(app: App, file: TFile): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		delete fm.reply_to;
	});
}

export const DEFAULT_EXPORT_FILENAME_TEMPLATE = "{{datetime}}";
export const DEFAULT_EXPORT_FILENAME_DATE_TIME_FORMAT = "YYYY-MM-DD HHmmss";
export const DEFAULT_EXPORT_USER_NAME = "User";
export const DEFAULT_EXPORT_REFLECTION_NAME = "Reflection";
export const DEFAULT_EXPORT_LINE_TEMPLATE =
	"- **{{date}} · {{time}}** — **{{speaker}}:** {{text}}";
export const DEFAULT_EXPORT_NOTE_DATE_FORMAT = "D MMM YYYY";
export const DEFAULT_EXPORT_NOTE_TIME_FORMAT = "HH:mm";

export interface ThreadExportFormat {
	userName: string;
	reflectionName: string;
	lineTemplate: string;
	noteDateFormat: string;
	noteTimeFormat: string;
	depths: ReadonlyMap<string, number>;
}

export function exportFileName(
	rootBasename: string,
	kind: "thread" | "branch",
	template: string,
	dateTimeFormat: string,
	exportedAt: Date,
): string {
	const datetime = moment(exportedAt).format(
		dateTimeFormat.trim() || DEFAULT_EXPORT_FILENAME_DATE_TIME_FORMAT,
	);
	const rendered = (template.trim() || DEFAULT_EXPORT_FILENAME_TEMPLATE).replace(
		/\{\{(datetime|root|type)\}\}/gu,
		(token, key: string) => {
			if (key === "datetime") return datetime;
			if (key === "root") return rootBasename;
			if (key === "type") return kind;
			return token;
		},
	);
	return sanitiseName(rendered) || sanitiseName(datetime) || "Ripple export";
}

function speakerName(name: string, fallback: string): string {
	return name.replace(/\s+/gu, " ").trim() || fallback;
}

function frontmatterForExport(head: string): string {
	if (!head) return "---\nripple_export: true\n---\n\n";
	const trimmed = head.replace(/(?:\r?\n)+$/u, "");
	const close = /(\r?\n)---[ \t]*$/u.exec(trimmed);
	if (!/^\uFEFF?---[ \t]*(?:\r?\n)/u.test(trimmed) || !close) {
		throw new Error("Ripple: could not preserve export frontmatter");
	}
	const eol = close[1] ?? "\n";
	const lines = trimmed.split(/\r?\n/u);
	const field = /^(?:ripple_export|"ripple_export"|'ripple_export')\s*:/u;
	const index = lines.findIndex((line, i) => i > 0 && i < lines.length - 1 && field.test(line));
	if (index < 0) {
		lines.splice(lines.length - 1, 0, "ripple_export: true");
	} else {
		lines[index] = "ripple_export: true";
		let end = index + 1;
		while (
			end < lines.length - 1 &&
			(lines[end]?.trim() === "" || /^[ \t]/u.test(lines[end] ?? ""))
		) {
			end++;
		}
		lines.splice(index + 1, end - index - 1);
	}
	return `${lines.join(eol)}${eol}${eol}`;
}

function exportPath(app: App, folder: string, stem: string): string {
	for (let copy = 1; ; copy++) {
		const suffix = copy === 1 ? "" : ` ${copy}`;
		const path = normalizePath(folder ? `${folder}/${stem}${suffix}.md` : `${stem}${suffix}.md`);
		if (!app.vault.getAbstractFileByPath(path)) return path;
	}
}

/** Combines the persisted thread into a normal note. */
export async function exportThreadAsNote(
	app: App,
	thread: Thread,
	journalFolder: string,
	format: ThreadExportFormat,
	fileName: string,
): Promise<TFile> {
	const sources = await Promise.all(
		[thread.root, ...thread.replies].map(async (post) => {
			const file = app.vault.getFileByPath(post.path);
			if (!file) throw new Error(`Ripple: export source disappeared: ${post.path}`);
			const text = await app.vault.cachedRead(file);
			return { post, file, ...splitFrontmatter(app, file, text) };
		}),
	);
	const root = sources[0];
	if (!root) throw new Error("Ripple: export has no root post");
	const stem = sanitiseName(fileName) || "Ripple export";
	const preferredParent = app.fileManager.getNewFileParent(root.file.path, `${stem}.md`);
	const journal = normalizePath(journalFolder);
	const parentPath = normalizePath(preferredParent.path);
	const parentInsideJournal =
		journal === "" ||
		journal === "/" ||
		parentPath === journal ||
		parentPath.startsWith(`${journal}/`);
	const parent = parentInsideJournal ? app.vault.getRoot() : preferredParent;
	const path = exportPath(app, parent.path, stem);
	const userName = speakerName(format.userName, DEFAULT_EXPORT_USER_NAME);
	const reflectionName = speakerName(
		format.reflectionName,
		DEFAULT_EXPORT_REFLECTION_NAME,
	);
	const lineTemplate = format.lineTemplate.trim() || DEFAULT_EXPORT_LINE_TEMPLATE;
	const noteDateFormat =
		format.noteDateFormat.trim() || DEFAULT_EXPORT_NOTE_DATE_FORMAT;
	const noteTimeFormat =
		format.noteTimeFormat.trim() || DEFAULT_EXPORT_NOTE_TIME_FORMAT;
	const lines = sources.map(({ post, file, body }) => {
		const speaker = post.ai ? reflectionName : userName;
		const content = body.replace(/\s+/gu, " ").trim();
		const created = moment(post.created);
		const timestamp = created.isValid() ? created : moment(file.stat.ctime);
		const line = lineTemplate.replace(
			/\{\{(date|time|speaker|text)\}\}/gu,
			(token, key: string) => {
				if (key === "date") return timestamp.format(noteDateFormat);
				if (key === "time") return timestamp.format(noteTimeFormat);
				if (key === "speaker") return speaker;
				if (key === "text") return content;
				return token;
			},
		);
		const depth = Math.max(0, Math.floor(format.depths.get(post.path) ?? 0));
		return `${"\t".repeat(depth)}${line}`;
	});
	return app.vault.create(path, `${frontmatterForExport(root.head)}${lines.join("\n")}\n`);
}
