import { createContext, useContext } from "react";
import type RipplePlugin from "../main";

export const PluginContext = createContext<RipplePlugin | null>(null);

export function usePlugin(): RipplePlugin {
	const plugin = useContext(PluginContext);
	if (!plugin) throw new Error("Ripple: PluginContext is missing");
	return plugin;
}
