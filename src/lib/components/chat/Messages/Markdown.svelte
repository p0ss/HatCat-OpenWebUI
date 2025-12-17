<script lang="ts">
	import { marked } from 'marked';
	import { replaceTokens, processResponseContent } from '$lib/utils';
	import { user } from '$lib/stores';
	import { colorModeStore, type ColorMode } from '$lib/stores/steering';

	import markedExtension from '$lib/utils/marked/extension';
	import markedKatexExtension from '$lib/utils/marked/katex-extension';
	import { mentionExtension } from '$lib/utils/marked/mention-extension';

	import MarkdownTokens from './Markdown/MarkdownTokens.svelte';

	export let id = '';
	export let content;
	export let tokenMetadata = undefined;
	export let done = true;
	export let model = null;
	export let save = false;
	export let preview = false;

	// HatCat: Debug logging
	$: if (tokenMetadata) {
		console.log('HatCat tokenMetadata received:', tokenMetadata);
	}

	// HatCat: Track selected token for mobile click and popup position
	let selectedTokenIndex = -1;
	let hoveredTokenIndex = -1;
	let popupElement;
	let tokenElements = [];
	let popupPosition = { top: 0, left: 0 };
	let shouldPositionAbove = false;

	// HatCat: Color mode for token visualization
	let colorMode: ColorMode = 'rainbow';
	colorModeStore.subscribe(value => {
		colorMode = value;
	});

	// HatCat: Apply color mode transformation
	function applyColorMode(originalColor: string, divergence: number): string {
		if (colorMode === 'dissonance') {
			// Use hat red (#de563f) with varying opacity based on divergence
			const alpha = Math.min(1, divergence / 0.5); // Scale 0-0.5 to 0-1
			return `rgba(222, 86, 63, ${alpha})`;
		} else if (colorMode === 'greyscale') {
			// Convert to greyscale based on divergence intensity
			const intensity = Math.floor(255 * (1 - Math.min(1, divergence)));
			return `rgb(${intensity}, ${intensity}, ${intensity})`;
		}
		// Default: rainbow mode - return original color
		return originalColor;
	}

	function handleTokenClick(index, event) {
		if (selectedTokenIndex === index) {
			selectedTokenIndex = -1; // Deselect if clicking the same token
		} else {
			selectedTokenIndex = index;
			updatePopupPosition(event.currentTarget);
		}
	}

	function handleTokenHover(index, event) {
		hoveredTokenIndex = index;
		updatePopupPosition(event.currentTarget);
	}

	function handleTokenLeave() {
		hoveredTokenIndex = -1;
	}

	function updatePopupPosition(tokenElement) {
		if (!tokenElement) return;

		const rect = tokenElement.getBoundingClientRect();
		const containerRect = tokenElement.closest('.hatcat-colored-tokens')?.getBoundingClientRect();

		if (containerRect) {
			// Use actual popup height if available, otherwise estimate
			const popupHeight = popupElement?.offsetHeight || 250;
			const spaceBelow = window.innerHeight - rect.bottom;
			const spaceAbove = rect.top;

			// If not enough space below and more space above, position above the token
			shouldPositionAbove = spaceBelow < popupHeight && spaceAbove > spaceBelow;

			if (shouldPositionAbove) {
				// Position above - wait for popup to render to get actual height
				setTimeout(() => {
					const actualHeight = popupElement?.offsetHeight || popupHeight;
					popupPosition = {
						top: rect.top - containerRect.top - actualHeight - 5,
						left: rect.left - containerRect.left
					};
				}, 0);
			} else {
				// Position below
				popupPosition = {
					top: rect.bottom - containerRect.top + 5,
					left: rect.left - containerRect.left
				};
			}
		}
	}

	// Show popup if either selected or hovered
	$: activeTokenIndex = selectedTokenIndex >= 0 ? selectedTokenIndex : hoveredTokenIndex;

	export let editCodeBlock = true;
	export let topPadding = false;

	export let sourceIds = [];

	export let onSave = () => {};
	export let onUpdate = () => {};

	export let onPreview = () => {};

	export let onSourceClick = () => {};
	export let onTaskClick = () => {};

	let tokens = [];

	const options = {
		throwOnError: false,
		breaks: true
	};

	marked.use(markedKatexExtension(options));
	marked.use(markedExtension(options));
	marked.use({
		extensions: [mentionExtension({ triggerChar: '@' }), mentionExtension({ triggerChar: '#' })]
	});

	$: (async () => {
		if (content) {
			tokens = marked.lexer(
				replaceTokens(processResponseContent(content), sourceIds, model?.name, $user?.name)
			);
		}
	})();
</script>

<style>
	.hatcat-token-selected {
		outline: 2px solid #48a4a3 !important;
		outline-offset: 1px;
		box-shadow: 0 0 0 3px rgba(72, 164, 163, 0.3);
	}

	.hatcat-popup {
		position: absolute;
		background: white;
		border: 2px solid #48a4a3;
		border-radius: 8px;
		padding: 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 9999;
		max-width: 300px;
		max-height: 400px;
		overflow-y: auto;
		pointer-events: none; /* Default: don't block interactions */
		width: max-content;
	}

	.hatcat-popup-interactive {
		pointer-events: auto; /* Allow interaction when token is selected */
	}

	.hatcat-popup-dark {
		background: #302e2c;
		color: #f3f4f6;
		border-color: #48a4a3;
	}

	.hatcat-colored-tokens {
		position: relative;
	}
</style>

{#key id}
	{#if tokenMetadata && tokenMetadata.length > 0}
		<!-- HatCat: Render colored tokens with divergence metadata -->
		<div class="hatcat-colored-tokens">
			{#each tokenMetadata as { token, metadata }, index}
				{@const hasSignificantDivergence = metadata?.divergence?.max_divergence > 0.2}
				{@const hasMetadata = metadata?.divergence}
				{@const divergenceValue = metadata?.divergence?.max_divergence || 0}
				{@const finalColor = hasSignificantDivergence
					? applyColorMode('#de563f', divergenceValue)
					: ''}
				{#if hasMetadata}
					<span
						class="hatcat-token"
						class:hatcat-token-selected={selectedTokenIndex === index}
						style="{finalColor ? `background-color: ${finalColor}; color: ${getContrastColor(finalColor)};` : ''} padding: 0 1px; cursor: pointer;"
						on:click={(e) => handleTokenClick(index, e)}
						on:mouseenter={(e) => handleTokenHover(index, e)}
						on:mouseleave={handleTokenLeave}
						role="button"
						tabindex="0"
						on:keydown={(e) => e.key === 'Enter' && handleTokenClick(index, e)}
					>{token}</span>
				{:else}
					{token}
				{/if}
			{/each}

			<!-- Show popup for active token (selected or hovered) -->
			{#if activeTokenIndex >= 0 && tokenMetadata[activeTokenIndex]?.metadata}
				<div
					class="hatcat-popup hatcat-popup-dark"
					bind:this={popupElement}
					class:hatcat-popup-interactive={selectedTokenIndex >= 0}
					style="top: {popupPosition.top}px; left: {popupPosition.left}px;">
					{@html formatMetadataPopup(tokenMetadata[activeTokenIndex].metadata)}
				</div>
			{/if}
		</div>
	{:else}
		<MarkdownTokens
			{tokens}
			{tokenMetadata}
			{id}
			{done}
			{save}
			{preview}
			{editCodeBlock}
			{topPadding}
			{onTaskClick}
			{onSourceClick}
			{onSave}
			{onUpdate}
			{onPreview}
		/>
	{/if}
{/key}

<script context="module">
	// Helper function to calculate contrasting text color
	function getContrastColor(hexColor) {
		if (!hexColor) return '#000000';
		const hex = hexColor.replace('#', '');
		const r = parseInt(hex.substr(0, 2), 16);
		const g = parseInt(hex.substr(2, 2), 16);
		const b = parseInt(hex.substr(4, 2), 16);
		const brightness = (r * 299 + g * 587 + b * 114) / 1000;
		return brightness > 155 ? '#000000' : '#ffffff';
	}

	// Helper function to generate tooltip text with concepts
	function getTooltipText(metadata) {
		if (!metadata) return 'N/A';

		const divergence = metadata.divergence;
		if (!divergence) return 'N/A';

		let tooltip = `Max Divergence: ${divergence.max_divergence?.toFixed(3) ?? 'N/A'}`;

		// Show top concepts sorted by activation
		if (divergence.top_divergences && divergence.top_divergences.length > 0) {
			tooltip += '\n\nTop Concepts:';
			divergence.top_divergences.forEach(item => {
				tooltip += `\n  ${item.concept}:`;
				tooltip += `\n    Activation: ${item.activation.toFixed(3)}`;
				tooltip += `\n    Text Similarity: ${item.text_similarity.toFixed(3)}`;
				tooltip += `\n    Divergence: ${item.divergence.toFixed(3)}`;
			});
		}

		return tooltip;
	}

	// Helper function to format metadata for display popup
	function formatMetadataPopup(metadata) {
		if (!metadata?.divergence) return '';

		const div = metadata.divergence;

		// Debug: log what we're receiving
		console.log('HatCat: Formatting popup for metadata:', div);

		let html = `<div style="font-family: monospace; font-size: 12px; line-height: 1.6;">`;
		html += `<strong>Max Divergence:</strong> ${div.max_divergence?.toFixed(3) ?? 'N/A'}<br><br>`;

		// Show top concepts (sorted by activation)
		if (div.top_divergences && div.top_divergences.length > 0) {
			html += `<strong>Top Concepts:</strong><br>`;
			div.top_divergences.forEach(item => {
				html += `<div style="margin-left: 10px; margin-top: 5px;">`;
				html += `<strong>${item.concept}</strong><br>`;
				html += `<span style="color: #48a4a3;">Activation: ${item.activation.toFixed(3)}</span><br>`;
				html += `<span style="color: #f0e6c5;">Text Similarity: ${item.text_similarity.toFixed(3)}</span><br>`;
				html += `<span style="color: #de563f;">Divergence: ${item.divergence.toFixed(3)}</span>`;
				html += `</div>`;
			});
		}

		html += `</div>`;
		return html;
	}
</script>
