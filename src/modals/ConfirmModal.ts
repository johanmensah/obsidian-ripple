import { App, Modal } from "obsidian";

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly message: string,
		private readonly confirmLabel: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl("p", { text: this.message });
		const row = this.contentEl.createDiv({ cls: "modal-button-container" });
		const confirm = row.createEl("button", { text: this.confirmLabel, cls: "mod-warning" });
		confirm.onclick = () => {
			this.close();
			this.onConfirm();
		};
		row.createEl("button", { text: "Cancel" }).onclick = () => this.close();
		confirm.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
