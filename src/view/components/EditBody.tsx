import { useEffect, useState } from "react";
import { splitFrontmatter } from "../../services/post-io";
import { usePlugin } from "../context";
import { Composer } from "./Composer";

export function EditBody({
	path,
	onDone,
}: {
	path: string;
	onDone: (body: string | null) => boolean | Promise<boolean>;
}) {
	const plugin = usePlugin();
	const [initial, setInitial] = useState<string | null>(null);
	useEffect(() => {
		const file = plugin.app.vault.getFileByPath(path);
		if (!file) return;
		let alive = true;
		void plugin.app.vault
			.cachedRead(file)
			.then((text) => {
				const { head, body } = splitFrontmatter(plugin.app, file, text);
				const withoutSeparator = head ? body.replace(/^\r?\n/u, "") : body;
				if (alive) setInitial(withoutSeparator.replace(/\r?\n$/u, ""));
			})
			.catch((err: unknown) => {
				console.error("Ripple: read note for editing failed", err, path);
			});
		return () => {
			alive = false;
		};
	}, [path, plugin]);
	if (initial === null) return null;
	return (
		<Composer
			placeholder=""
			initial={initial}
			autoFocus
			submitLabel="Save"
			onSubmit={(body) => onDone(body)}
			onCancel={() => {
				void onDone(null);
			}}
		/>
	);
}
