import { App, PluginSettingTab, Setting, debounce } from "obsidian";
import type RipplePlugin from "./main";
import { FolderPicker } from "./modals/FolderPicker";
import { getAI } from "./services/reflect";

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
			.addText((text) => {
				// Debounced: applying per keystroke would point a live store at
				// every half-typed path.
				const apply = debounce(
					(value: string) =>
						void this.plugin.setJournalFolder(
							value.trim() || DEFAULT_SETTINGS.journalFolder,
						),
					600,
					true,
				);
				text.setValue(this.plugin.settings.journalFolder).onChange(apply);
			})
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

		const provider = new Setting(containerEl)
			.setName("AI provider")
			.setDesc("Looking for the AI Providers plugin…");
		void getAI().then((ai) => {
			if (!ai) {
				provider.setDesc(
					"Install and configure the AI Providers plugin to enable reflections.",
				);
				return;
			}
			provider.setDesc("Reflections stream from this provider; keys stay with AI Providers.");
			provider.addDropdown((dropdown) => {
				dropdown.addOption("", "None");
				for (const p of ai.providers) {
					dropdown.addOption(p.id, p.model ? `${p.name} (${p.model})` : p.name);
				}
				const current = this.plugin.settings.aiProviderId;
				dropdown.setValue(current && ai.providers.some((p) => p.id === current) ? current : "");
				dropdown.onChange(async (value) => {
					this.plugin.settings.aiProviderId = value || null;
					await this.plugin.saveSettings();
				});
			});
		});

		new Setting(containerEl)
			.setName("Reflection prompt")
			.setDesc("How the AI should read and reply to an entry.")
			.addTextArea((text) =>
				text.setValue(this.plugin.settings.reflectionPrompt).onChange(async (value) => {
					this.plugin.settings.reflectionPrompt =
						value.trim() || DEFAULT_REFLECTION_PROMPT;
					await this.plugin.saveSettings();
				}),
			);
	}
}
