import { writable, get } from 'svelte/store';

export type SteeringMode = 'projection' | 'contrastive';

export interface SteeringConcept {
	concept: string;
	strength: number; // -1 to +1
	layer: number;
	source: string; // 'user' or 'auto'
	mode: SteeringMode; // 'projection' or 'contrastive'
	target?: string; // For contrastive mode
}

export type ColorMode = 'rainbow' | 'dissonance' | 'greyscale';

// Color mode store for token visualization
function createColorModeStore() {
	const { subscribe, set } = writable<ColorMode>('dissonance');

	return {
		subscribe,
		setMode: (mode: ColorMode) => set(mode)
	};
}

export const colorModeStore = createColorModeStore();

function createSteeringStore() {
	const { subscribe, set, update } = writable<SteeringConcept[]>([]);

	return {
		subscribe,
		addConcept: (
			concept: string,
			strength: number = 0.5,
			layer: number = 0,
			mode: SteeringMode = 'contrastive',
			target?: string
		) => {
			update(concepts => {
				// Check if concept already exists
				const existing = concepts.find(c => c.concept === concept);
				if (existing) {
					// Update existing
					existing.strength = strength;
					existing.mode = mode;
					existing.target = target;
					return [...concepts];
				}
				// Add new concept
				return [...concepts, {
					concept,
					strength,
					layer,
					source: 'user',
					mode,
					target
				}];
			});
		},
		removeConcept: (concept: string) => {
			update(concepts => concepts.filter(c => c.concept !== concept));
		},
		updateStrength: (concept: string, strength: number) => {
			update(concepts => {
				const item = concepts.find(c => c.concept === concept);
				if (item) {
					item.strength = Math.max(-1, Math.min(1, strength)); // Clamp to -1 to +1
				}
				return [...concepts];
			});
		},
		updateMode: (concept: string, mode: SteeringMode, target?: string) => {
			update(concepts => {
				const item = concepts.find(c => c.concept === concept);
				if (item) {
					item.mode = mode;
					item.target = target;
				}
				return [...concepts];
			});
		},
		clear: () => set([]),
		getAll: () => get({ subscribe })
	};
}

export const steeringStore = createSteeringStore();
