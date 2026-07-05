import { App, PluginSettingTab, Setting } from "obsidian";
import type RipplePlugin from "./main";
import { FolderPicker } from "./modals/FolderPicker";

/** UI state persisted under the reserved "ui" key in data.json, beside the settings. */
export interface UiState {
	monthFilter?: string | null;
	tagFilter?: string | null;
	highlightFilter?: string | null;
	collapsedYears?: string[];
}

export interface RippleSettings {
	journalFolder: string;
	aiProviderId: string | null;
	reflectionPrompt: string;
}

export const DEFAULT_REFLECTION_PROMPT =
	"You are a thoughtful companion reading a private journal. Reply to the entry in a few short sentences: notice what matters, ask at most one question, and never flatter or moralise.";

export const DEFAULT_SETTINGS: RippleSettings = {
	journalFolder: "Ripple",
	aiProviderId: null,
	reflectionPrompt: DEFAULT_REFLECTION_PROMPT,
};

export class RippleSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: RipplePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Journal folder")
			.setDesc("Posts live here and nowhere else; the rest of the vault is untouched.")
			.addText((text) =>
				text.setValue(this.plugin.settings.journalFolder).onChange(async (value) => {
					await this.plugin.setJournalFolder(value.trim() || DEFAULT_SETTINGS.journalFolder);
				}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("folder-open")
					.setTooltip("Choose an existing folder")
					.onClick(() => {
						new FolderPicker(this.app, (folder) => {
							void this.plugin.setJournalFolder(folder.path);
							this.display();
						}).open();
					}),
			);
	}
}
