import { App, FuzzySuggestModal, TFolder, normalizePath } from "obsidian";

export class FolderPicker extends FuzzySuggestModal<TFolder> {
	private readonly seeds: string[];

	constructor(
		app: App,
		private readonly onPick: (folder: TFolder) => void,
		seeds: string[] = [],
		placeholder = "Choose a folder",
	) {
		super(app);
		this.seeds = seeds.map((s) => normalizePath(s));
		this.setPlaceholder(placeholder);
	}

	getItems(): TFolder[] {
		const all = this.app.vault.getAllFolders(true);
		if (this.seeds.length === 0) return all;
		// Seeded destinations and their subfolders come first, in seed order.
		const rank = (folder: TFolder) =>
			this.seeds.findIndex((s) => folder.path === s || folder.path.startsWith(s + "/"));
		const seeded = all
			.filter((f) => rank(f) !== -1)
			.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
		const rest = all.filter((f) => rank(f) === -1);
		return [...seeded, ...rest];
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onPick(folder);
	}
}
