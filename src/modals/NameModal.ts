import { App, Modal, Notice } from "obsidian";

export class NameModal extends Modal {
	constructor(
		app: App,
		private readonly initial: string,
		private readonly onSubmit: (name: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Name note");
		const input = this.contentEl.createEl("input", {
			type: "text",
			value: this.initial,
			cls: "ripple-name-input",
		});
		const row = this.contentEl.createDiv({ cls: "modal-button-container" });
		const save = row.createEl("button", { text: "Save", cls: "mod-cta" });
		const submit = () => {
			const name = input.value.trim();
			if (!name) {
				new Notice("A name is required.");
				return;
			}
			this.close();
			this.onSubmit(name);
		};
		save.onclick = submit;
		row.createEl("button", { text: "Cancel" }).onclick = () => this.close();
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submit();
			}
		});
		input.focus();
		input.select();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
