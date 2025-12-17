import { EventSourceParserStream } from 'eventsource-parser/stream';
import type { ParsedEvent } from 'eventsource-parser';

type TextStreamUpdate = {
	done: boolean;
	value: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sources?: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	selectedModelId?: any;
	error?: any;
	usage?: ResponseUsage;
	// HatCat: model field for identifying analyzer messages
	model?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	choices?: any;
	// HatCat: metadata for token-level visualization
	metadata?: {
		divergence?: any;
		color?: string;
		palette?: string[];
		steering?: any;
	};
};

type ResponseUsage = {
	/** Including images and tools if any */
	prompt_tokens: number;
	/** The tokens generated */
	completion_tokens: number;
	/** Sum of the above two fields */
	total_tokens: number;
	/** Any other fields that aren't part of the base OpenAI spec */
	[other: string]: unknown;
};

// createOpenAITextStream takes a responseBody with a SSE response,
// and returns an async generator that emits delta updates with large deltas chunked into random sized chunks
export async function createOpenAITextStream(
	responseBody: ReadableStream<Uint8Array>,
	splitLargeDeltas: boolean
): Promise<AsyncGenerator<TextStreamUpdate>> {
	const eventStream = responseBody
		.pipeThrough(new TextDecoderStream())
		.pipeThrough(new EventSourceParserStream())
		.getReader();
	let iterator = openAIStreamToIterator(eventStream);
	if (splitLargeDeltas) {
		iterator = streamLargeDeltasAsRandomChunks(iterator);
	}
	return iterator;
}

async function* openAIStreamToIterator(
	reader: ReadableStreamDefaultReader<ParsedEvent>
): AsyncGenerator<TextStreamUpdate> {
	console.log('HatCat: openAIStreamToIterator started');
	while (true) {
		const { value, done } = await reader.read();
		if (done) {
			console.log('HatCat: Stream done');
			yield { done: true, value: '' };
			break;
		}
		if (!value) {
			continue;
		}
		const data = value.data;
		console.log('HatCat: Received SSE data:', data);
		if (data.startsWith('[DONE]')) {
			yield { done: true, value: '' };
			break;
		}

		try {
			const parsedData = JSON.parse(data);
			console.log('HatCat: Parsed SSE chunk:', parsedData);

			if (parsedData.error) {
				yield { done: true, value: '', error: parsedData.error };
				break;
			}

			if (parsedData.sources) {
				yield { done: false, value: '', sources: parsedData.sources };
				continue;
			}

			// HatCat: Check if this is from the analyzer model
			if (parsedData.model === 'hatcat-analyzer') {
				console.log('HatCat: Detected analyzer model chunk:', parsedData);
				// Pass the model field through so Chat.svelte can detect it
				yield {
					done: parsedData.choices?.[0]?.finish_reason === 'stop',
					value: parsedData.choices?.[0]?.delta?.content ?? '',
					model: 'hatcat-analyzer',
					choices: parsedData.choices
				};
				continue;
			}

			if (parsedData.selected_model_id) {
				yield { done: false, value: '', selectedModelId: parsedData.selected_model_id };
				continue;
			}

			if (parsedData.usage) {
				yield { done: false, value: '', usage: parsedData.usage };
				continue;
			}

			// Extract content and metadata from delta (HatCat support)
			const delta = parsedData.choices?.[0]?.delta;
			const content = delta?.content ?? '';
			let metadata = delta?.metadata;

			// Sanitize metadata to prevent injection attacks
			if (metadata) {
				// Validate color is a valid hex color
				if (metadata.color && !/^#[0-9A-Fa-f]{6}$/.test(metadata.color)) {
					metadata.color = '#808080'; // Fallback to gray
				}
				// Validate palette colors
				if (metadata.palette && Array.isArray(metadata.palette)) {
					metadata.palette = metadata.palette
						.filter((c: string) => /^#[0-9A-Fa-f]{6}$/.test(c))
						.slice(0, 10); // Limit to 10 colors max
				}
			}

			yield {
				done: false,
				value: content,
				...(metadata && { metadata })
			};
		} catch (e) {
			console.error('Error extracting delta from SSE event:', e);
		}
	}
}

// streamLargeDeltasAsRandomChunks will chunk large deltas (length > 5) into random sized chunks between 1-3 characters
// This is to simulate a more fluid streaming, even though some providers may send large chunks of text at once
async function* streamLargeDeltasAsRandomChunks(
	iterator: AsyncGenerator<TextStreamUpdate>
): AsyncGenerator<TextStreamUpdate> {
	for await (const textStreamUpdate of iterator) {
		if (textStreamUpdate.done) {
			yield textStreamUpdate;
			return;
		}

		if (textStreamUpdate.error) {
			yield textStreamUpdate;
			continue;
		}
		if (textStreamUpdate.sources) {
			yield textStreamUpdate;
			continue;
		}
		if (textStreamUpdate.selectedModelId) {
			yield textStreamUpdate;
			continue;
		}
		if (textStreamUpdate.usage) {
			yield textStreamUpdate;
			continue;
		}
		if (textStreamUpdate.metadata) {
			yield textStreamUpdate;
			continue;
		}
		// HatCat: Pass analyzer messages through immediately
		if (textStreamUpdate.model) {
			yield textStreamUpdate;
			continue;
		}

		let content = textStreamUpdate.value;
		if (content.length < 5) {
			yield { done: false, value: content };
			continue;
		}
		while (content != '') {
			const chunkSize = Math.min(Math.floor(Math.random() * 3) + 1, content.length);
			const chunk = content.slice(0, chunkSize);
			yield { done: false, value: chunk };
			// Do not sleep if the tab is hidden
			// Timers are throttled to 1s in hidden tabs
			if (document?.visibilityState !== 'hidden') {
				await sleep(5);
			}
			content = content.slice(chunkSize);
		}
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
