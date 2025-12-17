<script lang="ts">
	import { steeringStore, type SteeringConcept, type SteeringMode, colorModeStore, type ColorMode } from '$lib/stores/steering';
	import { slide } from 'svelte/transition';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import { WEBUI_BASE_URL } from '$lib/constants';

	export let recentConcepts: string[] = []; // Concepts from recent analysis messages
	export let onClose: () => void = () => {};

	let activeSteerings: SteeringConcept[] = [];
	let colorMode: ColorMode = 'rainbow';

	// Concept search state
	let searchQuery = '';
	let searchResults: string[] = [];
	let isSearching = false;
	let searchTimeout: ReturnType<typeof setTimeout>;

	// Target selection state (per concept being edited)
	let editingConcept: string | null = null;
	let steeringOptions: {
		auto_target?: string;
		is_sensitive?: boolean;
		available_targets?: {
			aunts_uncles: string[];
			cousins: string[];
			siblings: string[];
			distant: string[];
		};
	} | null = null;
	let loadingOptions = false;

	steeringStore.subscribe(value => {
		activeSteerings = value;
	});

	colorModeStore.subscribe(value => {
		colorMode = value;
	});

	function setColorMode(mode: ColorMode) {
		colorModeStore.setMode(mode);
	}

	async function searchConcepts(query: string) {
		if (query.length < 2) {
			searchResults = [];
			return;
		}

		isSearching = true;
		try {
			const response = await fetch(`${WEBUI_BASE_URL}/v1/concepts?search=${encodeURIComponent(query)}&limit=20`);
			if (response.ok) {
				const data = await response.json();
				searchResults = data.concepts || [];
			}
		} catch (e) {
			console.error('Failed to search concepts:', e);
			searchResults = [];
		}
		isSearching = false;
	}

	function handleSearchInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		searchQuery = value;

		// Debounce search
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => searchConcepts(value), 300);
	}

	async function fetchSteeringOptions(concept: string) {
		loadingOptions = true;
		try {
			const response = await fetch(`${WEBUI_BASE_URL}/v1/concepts/${encodeURIComponent(concept)}/steering-options`);
			if (response.ok) {
				steeringOptions = await response.json();
			}
		} catch (e) {
			console.error('Failed to fetch steering options:', e);
			steeringOptions = null;
		}
		loadingOptions = false;
	}

	async function addSteering(concept: string) {
		// Fetch steering options to get auto_target
		await fetchSteeringOptions(concept);
		const autoTarget = steeringOptions?.auto_target;

		// Default to contrastive mode with auto target
		steeringStore.addConcept(concept, 0.5, 0, 'contrastive', autoTarget);
		searchQuery = '';
		searchResults = [];
	}

	function removeSteering(concept: string) {
		steeringStore.removeConcept(concept);
		if (editingConcept === concept) {
			editingConcept = null;
			steeringOptions = null;
		}
	}

	function updateStrength(concept: string, value: number) {
		steeringStore.updateStrength(concept, value);
	}

	function updateMode(concept: string, mode: SteeringMode, target?: string) {
		steeringStore.updateMode(concept, mode, target);
	}

	async function toggleEditMode(concept: string) {
		if (editingConcept === concept) {
			editingConcept = null;
			steeringOptions = null;
		} else {
			editingConcept = concept;
			await fetchSteeringOptions(concept);
		}
	}

	function selectTarget(concept: string, target: string) {
		steeringStore.updateMode(concept, 'contrastive', target);
	}

	function clearAll() {
		steeringStore.clear();
		editingConcept = null;
		steeringOptions = null;
	}

	function getStrengthLabel(strength: number): string {
		if (strength > 0.7) return 'Strong Amplify';
		if (strength > 0.3) return 'Amplify';
		if (strength > -0.3) return 'Neutral';
		if (strength > -0.7) return 'Suppress';
		return 'Strong Suppress';
	}

	function getStrengthColor(strength: number): string {
		if (strength > 0) return '#48a4a3'; // HatCat teal
		if (strength < 0) return '#de563f'; // Hat red
		return 'rgb(156, 163, 175)'; // gray
	}

	function getModeLabel(mode: SteeringMode): string {
		return mode === 'contrastive' ? 'Contrastive' : 'Projection';
	}
</script>

<div class="steering-panel" transition:slide={{ duration: 200 }}>
	<div class="flex items-center justify-between mb-4 pb-2 border-b dark:border-gray-700">
		<h3 class="text-lg font-semibold dark:text-white">Concept Steering</h3>
		<button
			on:click={onClose}
			class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
			aria-label="Close steering panel"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
			</svg>
		</button>
	</div>

	<!-- Color Mode Toggle -->
	<div class="mb-4">
		<h4 class="text-sm font-medium dark:text-gray-300 mb-2">Token Color Mode</h4>
		<div class="flex gap-2">
			<button
				on:click={() => setColorMode('rainbow')}
				class="flex-1 px-3 py-2 text-xs rounded transition-colors"
				class:active-mode={colorMode === 'rainbow'}
				class:inactive-mode={colorMode !== 'rainbow'}
			>
				Rainbow
			</button>
			<button
				on:click={() => setColorMode('dissonance')}
				class="flex-1 px-3 py-2 text-xs rounded transition-colors"
				class:active-mode={colorMode === 'dissonance'}
				class:inactive-mode={colorMode !== 'dissonance'}
			>
				Dissonance
			</button>
			<button
				on:click={() => setColorMode('greyscale')}
				class="flex-1 px-3 py-2 text-xs rounded transition-colors"
				class:active-mode={colorMode === 'greyscale'}
				class:inactive-mode={colorMode !== 'greyscale'}
			>
				Greyscale
			</button>
		</div>
	</div>

	<!-- Concept Search -->
	<div class="mb-4">
		<h4 class="text-sm font-medium dark:text-gray-300 mb-2">Add Concept</h4>
		<div class="relative">
			<input
				type="text"
				placeholder="Search concepts..."
				value={searchQuery}
				on:input={handleSearchInput}
				class="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
			/>
			{#if isSearching}
				<div class="absolute right-3 top-2.5 text-gray-400">
					<svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
					</svg>
				</div>
			{/if}
		</div>
		{#if searchResults.length > 0}
			<div class="mt-2 max-h-32 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-600">
				{#each searchResults as concept}
					{@const isActive = activeSteerings.some(s => s.concept === concept)}
					<button
						on:click={() => !isActive && addSteering(concept)}
						disabled={isActive}
						class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700
							{isActive ? 'text-gray-400 cursor-not-allowed' : 'dark:text-white cursor-pointer'}"
					>
						{concept} {#if isActive}<span class="text-xs">(active)</span>{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Active Steerings Section -->
	{#if activeSteerings.length > 0}
		<div class="mb-4">
			<div class="flex items-center justify-between mb-2">
				<h4 class="text-sm font-medium dark:text-gray-300">Active Steerings ({activeSteerings.length})</h4>
				<button
					on:click={clearAll}
					class="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400"
				>
					Clear All
				</button>
			</div>
			<div class="space-y-3">
				{#each activeSteerings as steering (steering.concept)}
					<div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg" transition:slide={{ duration: 150 }}>
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center gap-2">
								<span class="font-medium text-sm dark:text-white">{steering.concept}</span>
								{#if steering.mode === 'contrastive' && steering.target}
									<span class="text-xs px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300">
										→ {steering.target}
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-1">
								<button
									on:click={() => toggleEditMode(steering.concept)}
									class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
									aria-label="Edit steering options"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
									</svg>
								</button>
								<button
									on:click={() => removeSteering(steering.concept)}
									class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
									aria-label="Remove steering"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
									</svg>
								</button>
							</div>
						</div>

						<!-- Mode selector (expanded view) -->
						{#if editingConcept === steering.concept}
							<div class="mb-3 p-2 bg-gray-100 dark:bg-gray-700 rounded" transition:slide={{ duration: 150 }}>
								<div class="mb-2">
									<span class="text-xs font-medium dark:text-gray-300">Mode:</span>
									<div class="flex gap-2 mt-1">
										<button
											on:click={() => updateMode(steering.concept, 'contrastive', steeringOptions?.auto_target)}
											class="flex-1 px-2 py-1 text-xs rounded {steering.mode === 'contrastive' ? 'bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-600 dark:text-gray-300'}"
										>
											Contrastive
										</button>
										<button
											on:click={() => updateMode(steering.concept, 'projection')}
											class="flex-1 px-2 py-1 text-xs rounded {steering.mode === 'projection' ? 'bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-600 dark:text-gray-300'}"
										>
											Projection
										</button>
									</div>
								</div>

								{#if steering.mode === 'contrastive'}
									<div>
										<span class="text-xs font-medium dark:text-gray-300">Target:</span>
										{#if loadingOptions}
											<div class="text-xs text-gray-500 mt-1">Loading options...</div>
										{:else if steeringOptions}
											<div class="mt-1 max-h-24 overflow-y-auto">
												{#if steeringOptions.auto_target}
													<button
														on:click={() => selectTarget(steering.concept, steeringOptions?.auto_target || '')}
														class="w-full text-left px-2 py-1 text-xs rounded mb-1
															{steering.target === steeringOptions.auto_target
																? 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300'
																: 'hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-300'}"
													>
														{steeringOptions.auto_target} <span class="text-gray-500">(auto)</span>
													</button>
												{/if}
												{#if steeringOptions.available_targets}
													{#each steeringOptions.available_targets.aunts_uncles || [] as target}
														<button
															on:click={() => selectTarget(steering.concept, target)}
															class="w-full text-left px-2 py-1 text-xs rounded mb-1
																{steering.target === target
																	? 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300'
																	: 'hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-300'}"
														>
															{target} <span class="text-gray-500">(aunt/uncle)</span>
														</button>
													{/each}
													{#each steeringOptions.available_targets.siblings || [] as target}
														<button
															on:click={() => selectTarget(steering.concept, target)}
															class="w-full text-left px-2 py-1 text-xs rounded mb-1
																{steering.target === target
																	? 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300'
																	: 'hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-300'}"
														>
															{target} <span class="text-gray-500">(sibling)</span>
														</button>
													{/each}
												{/if}
											</div>
										{/if}
									</div>
								{/if}

								{#if steeringOptions?.is_sensitive}
									<div class="mt-2 text-xs text-amber-600 dark:text-amber-400">
										Sensitive concept - curated target recommended
									</div>
								{/if}
							</div>
						{/if}

						<!-- Strength Slider -->
						<div class="space-y-1">
							<input
								type="range"
								min="-1"
								max="1"
								step="0.1"
								value={steering.strength}
								on:input={(e) => updateStrength(steering.concept, parseFloat(e.currentTarget.value))}
								class="w-full h-2 rounded-lg appearance-none cursor-pointer"
								style="background: linear-gradient(to right,
									#de563f 0%,
									rgb(156, 163, 175) 50%,
									#48a4a3 100%);"
							/>
							<div class="flex justify-between text-xs">
								<span style="color: #de563f;">-1.0</span>
								<span style="color: {getStrengthColor(steering.strength)}" class="font-medium">
									{steering.strength.toFixed(1)} ({getStrengthLabel(steering.strength)})
								</span>
								<span style="color: #48a4a3;">+1.0</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm text-gray-500 dark:text-gray-400">
			No active steerings. Search for concepts above or click detected concepts below.
		</div>
	{/if}

	<!-- Recent Concepts Section -->
	{#if recentConcepts.length > 0}
		<div>
			<h4 class="text-sm font-medium dark:text-gray-300 mb-2">Detected Concepts</h4>
			<p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
				From recent responses. Click to add steering.
			</p>
			<div class="flex flex-wrap gap-2">
				{#each recentConcepts as concept}
					{@const isActive = activeSteerings.some(s => s.concept === concept)}
					<button
						on:click={() => !isActive && addSteering(concept)}
						disabled={isActive}
						class="px-3 py-1.5 text-sm rounded-full transition-colors
							{isActive
								? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
								: 'cursor-pointer'
							}"
						style={!isActive ? 'background-color: rgba(72, 164, 163, 0.2); color: #48a4a3;' : ''}
					>
						{concept}
						{#if isActive}
							<span class="ml-1">active</span>
						{:else}
							<span class="ml-1">+</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{:else}
		<div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm text-gray-500 dark:text-gray-400">
			No recent concepts. Start chatting to see concepts detected by HatCat.
		</div>
	{/if}
</div>

<style>
	.steering-panel {
		position: absolute;
		bottom: 100%;
		left: 0;
		right: 0;
		margin-bottom: 8px;
		padding: 16px;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
		max-height: 500px;
		overflow-y: auto;
		z-index: 50;
	}

	:global(.dark) .steering-panel {
		background: #302e2c;
		border-color: #48a4a3;
		box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
	}

	/* Custom slider styles */
	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
	}

	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		border: 2px solid #6b7280;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		border: 2px solid #6b7280;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	:global(.dark) input[type='range']::-webkit-slider-thumb {
		background: #374151;
		border-color: #9ca3af;
	}

	:global(.dark) input[type='range']::-moz-range-thumb {
		background: #374151;
		border-color: #9ca3af;
	}

	/* Color mode toggle buttons */
	.active-mode {
		background-color: rgba(72, 164, 163, 0.3);
		color: #48a4a3;
		border: 1px solid #48a4a3;
	}

	.inactive-mode {
		background-color: transparent;
		color: #9ca3af;
		border: 1px solid transparent;
	}

	.inactive-mode:hover {
		background-color: rgba(156, 163, 175, 0.1);
		border-color: #9ca3af;
	}

	:global(.dark) .active-mode {
		background-color: rgba(72, 164, 163, 0.2);
		color: #48a4a3;
		border-color: #48a4a3;
	}

	:global(.dark) .inactive-mode {
		color: #6b7280;
	}

	:global(.dark) .inactive-mode:hover {
		background-color: rgba(107, 114, 128, 0.2);
		border-color: #6b7280;
	}
</style>
