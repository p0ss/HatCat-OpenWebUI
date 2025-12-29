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
	export let sentenceAnnotations = undefined;
	export let done = true;
	export let model = null;
	export let save = false;
	export let preview = false;

	// HatCat: Debug logging
	$: if (tokenMetadata) {
		console.log('HatCat tokenMetadata received:', tokenMetadata);
	}

	// HatCat: Debug logging for sentence annotations
	$: if (sentenceAnnotations && sentenceAnnotations.length > 0) {
		console.log('HatCat sentenceAnnotations received:', sentenceAnnotations);
	}

	// HatCat: Track selected token for mobile click and popup position
	let selectedTokenIndex = -1;
	let hoveredTokenIndex = -1;
	let popupElement;
	let tokenElements = [];
	let popupPosition = { top: 0, left: 0 };
	let shouldPositionAbove = false;

	// HatCat: Sentence highlighting threshold - only highlight sentences above this LLM divergence
	const SENTENCE_HIGHLIGHT_THRESHOLD = 0.3;  // 30% divergence triggers highlighting

	// HatCat: Compute which tokens belong to which sentences and if they should be highlighted
	// Returns array of { sentenceId, shouldHighlight, llmDivergence, concepts } for each token
	function computeSentenceMapping(tokens: Array<{token: string}>, annotations: Array<any>) {
		if (!tokens?.length || !annotations?.length) return [];

		const mapping = new Array(tokens.length).fill(null);
		let currentPos = 0;  // Position in accumulated text
		let accumulatedText = '';

		// Build full text from tokens
		tokens.forEach(t => accumulatedText += t.token);

		// For each sentence annotation, find its position in the text and mark tokens
		let searchStart = 0;
		for (const annotation of annotations) {
			const sentenceText = annotation.text;
			if (!sentenceText) continue;

			// Find where this sentence starts in the accumulated text
			const sentenceStart = accumulatedText.indexOf(sentenceText, searchStart);
			if (sentenceStart === -1) continue;

			const sentenceEnd = sentenceStart + sentenceText.length;
			searchStart = sentenceEnd;  // Start next search after this sentence

			// Determine if this sentence should be highlighted
			const llmDivergence = annotation.llm_divergence || 0;
			const shouldHighlight = llmDivergence >= SENTENCE_HIGHLIGHT_THRESHOLD;

			// Map character positions to token indices
			let charPos = 0;
			for (let i = 0; i < tokens.length; i++) {
				const tokenEnd = charPos + tokens[i].token.length;
				// If this token overlaps with the sentence
				if (charPos < sentenceEnd && tokenEnd > sentenceStart) {
					mapping[i] = {
						sentenceId: annotation.sentence_id,
						shouldHighlight,
						llmDivergence,
						concepts: annotation.llm_concerning_concepts || [],
					};
				}
				charPos = tokenEnd;
			}
		}

		return mapping;
	}

	// Reactive: compute sentence mapping when tokens or annotations change
	$: sentenceMapping = tokenMetadata && sentenceAnnotations
		? computeSentenceMapping(tokenMetadata, sentenceAnnotations)
		: [];

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

	.hatcat-sentence-highlight {
		/* Subtle underline for sentence-level divergence */
		transition: border-bottom-color 0.2s ease;
	}

	/* Sentence annotations summary styles */
	.hatcat-sentence-annotations {
		margin-top: 1rem;
		padding: 0.5rem;
		border-left: 3px solid rgba(222, 86, 63, 0.5);
		background: rgba(222, 86, 63, 0.05);
		border-radius: 0 4px 4px 0;
	}

	.hatcat-sentence-annotation {
		margin: 0.5rem 0;
		padding: 0.5rem;
		border-left: 3px solid;
		background: rgba(0, 0, 0, 0.02);
	}

	.hatcat-annotation-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.hatcat-annotation-intensity {
		font-weight: 600;
		font-size: 0.85em;
	}

	.hatcat-annotation-concepts {
		font-size: 0.8em;
		color: #888;
	}

	.hatcat-annotation-text {
		font-size: 0.9em;
		color: #666;
		font-style: italic;
	}
</style>

{#key id}
	{#if tokenMetadata && tokenMetadata.length > 0}
		<!-- HatCat: Render colored tokens with divergence metadata -->
		<div class="hatcat-colored-tokens">
			{#each tokenMetadata as { token, metadata }, index}
				{@const safetyIntensity = metadata?.divergence?.safety_intensity || 0}
				{@const hasSafetyConcerns = safetyIntensity > 0}
				{@const hasMetadata = metadata?.divergence}
				{@const safetyConceptsCount = metadata?.divergence?.safety_concepts?.length || 0}
				{@const finalColor = hasSafetyConcerns
					? applyColorMode('#de563f', safetyIntensity)
					: ''}
				{@const sentenceInfo = sentenceMapping[index]}
				{@const sentenceHighlight = sentenceInfo?.shouldHighlight}
				{@const sentenceDivergence = sentenceInfo?.llmDivergence || 0}
				{#if hasMetadata}
					<span
						class="hatcat-token"
						class:hatcat-token-selected={selectedTokenIndex === index}
						class:hatcat-sentence-highlight={sentenceHighlight}
						style="{finalColor ? `background-color: ${finalColor}; color: ${getContrastColor(finalColor)};` : ''}{sentenceHighlight ? ` border-bottom: 2px solid rgba(222, 86, 63, ${Math.min(1, sentenceDivergence)});` : ''} padding: 0 1px; cursor: pointer;"
						title={sentenceHighlight ? `Sentence divergence: ${(sentenceDivergence * 100).toFixed(0)}%` : ''}
						on:click={(e) => handleTokenClick(index, e)}
						on:mouseenter={(e) => handleTokenHover(index, e)}
						on:mouseleave={handleTokenLeave}
						role="button"
						tabindex="0"
						on:keydown={(e) => e.key === 'Enter' && handleTokenClick(index, e)}
					>{token}</span>
				{:else if sentenceHighlight}
					<!-- Token without per-token metadata but in a divergent sentence -->
					<span
						class="hatcat-sentence-highlight"
						style="border-bottom: 2px solid rgba(222, 86, 63, {Math.min(1, sentenceDivergence)});"
						title="Sentence divergence: {(sentenceDivergence * 100).toFixed(0)}%"
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

<!-- HatCat: Sentence annotations summary (only show if LLM divergence exceeds threshold) -->
{#if sentenceAnnotations && sentenceAnnotations.filter(a => (a.llm_divergence || 0) >= SENTENCE_HIGHLIGHT_THRESHOLD).length > 0}
	<div class="hatcat-sentence-annotations">
		<div style="font-size: 0.75em; color: #888; margin-bottom: 0.5rem;">
			Sentences with elevated LLM divergence:
		</div>
		{#each sentenceAnnotations.filter(a => (a.llm_divergence || 0) >= SENTENCE_HIGHLIGHT_THRESHOLD) as annotation}
			{@const llmDiv = annotation.llm_divergence || 0}
			<div class="hatcat-sentence-annotation" style="border-left-color: rgba(222, 86, 63, {Math.min(1, llmDiv)});">
				<div class="hatcat-annotation-header">
					<span class="hatcat-annotation-intensity" style="color: #de563f;">
						⚠️ {(llmDiv * 100).toFixed(0)}% divergence
					</span>
					<span class="hatcat-annotation-concepts">
						{(annotation.llm_concerning_concepts || annotation.safety_concepts || []).join(', ')}
					</span>
				</div>
				<div class="hatcat-annotation-text">
					"{annotation.text.substring(0, 100)}{annotation.text.length > 100 ? '...' : ''}"
				</div>
			</div>
		{/each}
	</div>
{/if}

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
				tooltip += `\n    Activation: ${item.activation?.toFixed(3) ?? 'N/A'}`;
				tooltip += `\n    Text Similarity: ${item.text_similarity?.toFixed(3) ?? 'N/A'}`;
				tooltip += `\n    Divergence: ${item.divergence?.toFixed(3) ?? 'N/A'}`;
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

		// Show safety intensity prominently if present
		if (div.safety_intensity > 0) {
			const intensityPercent = (div.safety_intensity * 100).toFixed(0);
			html += `<div style="background: rgba(222, 86, 63, 0.2); padding: 6px; border-radius: 4px; margin-bottom: 8px;">`;
			html += `<strong style="color: #de563f;">⚠️ Safety Intensity: ${intensityPercent}%</strong><br>`;
			if (div.safety_concepts && div.safety_concepts.length > 0) {
				html += `<span style="color: #f0e6c5; font-size: 11px;">${div.safety_concepts.join(', ')}</span>`;
			}
			html += `</div>`;
		}

		// Show top concepts (sorted by activation)
		if (div.top_divergences && div.top_divergences.length > 0) {
			html += `<strong>Top Concepts:</strong><br>`;
			div.top_divergences.forEach(item => {
				// Check if this is a safety concept (highlight differently)
				const isSafety = div.safety_concepts?.includes(item.concept);
				const conceptColor = isSafety ? '#de563f' : '#48a4a3';

				html += `<div style="margin-left: 10px; margin-top: 5px; ${isSafety ? 'background: rgba(222, 86, 63, 0.1); padding: 4px; border-radius: 3px;' : ''}">`;
				html += `<strong style="color: ${conceptColor};">${item.concept}</strong><br>`;
				html += `<span style="color: #48a4a3;">Activation: ${item.activation?.toFixed(3) ?? 'N/A'}</span>`;
				if (item.text_similarity != null) {
					html += `<br><span style="color: #f0e6c5;">Text Similarity: ${item.text_similarity.toFixed(3)}</span>`;
				}
				html += `</div>`;
			});
		}

		html += `</div>`;
		return html;
	}
</script>
