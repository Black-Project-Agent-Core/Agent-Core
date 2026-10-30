/**
 * Closed vocabularies for what the Native loop tells the model, so one cause is never worded as another.
 * Pure text and classification; nothing here dispatches, grants or retries anything.
 */
export type FinishCategory = 'completed' | 'truncated-by-limit' | 'refused-by-provider' | 'context-exceeded' | 'unknown';

/** Provider finish reasons differ by vendor; anything not recognised stays `unknown` and changes no behaviour. */
export function classifyFinishReason(reason: string | null | undefined): FinishCategory {
  const value = (reason ?? '').trim().toLowerCase();
  if (!value) return 'unknown';
  if (['stop', 'tool_calls', 'function_call', 'end_turn', 'tool_use', 'stop_sequence', 'eos'].includes(value)) return 'completed';
  if (['length', 'max_tokens', 'max_output_tokens', 'token_limit'].includes(value)) return 'truncated-by-limit';
  if (['content_filter', 'safety', 'refusal', 'blocked', 'prohibited_content'].includes(value)) return 'refused-by-provider';
  if (/context|too.?long|input.?limit/.test(value)) return 'context-exceeded';
  return 'unknown';
}

/** Model-facing sentence for a reply that did not end normally; `undefined` when nothing needs saying. */
export function finishReasonNote(category: FinishCategory): string | undefined {
  switch (category) {
    case 'truncated-by-limit':
      return 'FINISH_TRUNCATED_BY_LIMIT: the previous reply hit the output token limit and was cut off. Anything cut off was not run. Continue with a shorter reply or a smaller call.';
    case 'refused-by-provider':
      return 'FINISH_REFUSED_BY_PROVIDER: the provider declined to continue that reply. Rephrase or narrow the request; do not repeat it unchanged.';
    case 'context-exceeded':
      return 'FINISH_CONTEXT_EXCEEDED: the provider reports the context is too long. Work from the summary already given and keep the next request small.';
    default:
      return undefined;
  }
}

const SIMPLE_ANCHORS = 'halo|hai|hi|hello|hey|hei|selamat|assalamualaikum|salam|terima kasih|makasih|thanks|thank you|thx|apa kabar|how are you|siapa kamu|kamu siapa|who are you|tes|test|ping';
const SIMPLE_FILLERS = 'pagi|siang|sore|malam|morning|afternoon|evening|night|good|ya|yaa|dong|deh|nih|juga|banyak|bro|sob|kak|min|ai|agent|core|there|you|so|much';
const SIMPLE_WHOLE = new RegExp(`^(?:(?:${SIMPLE_ANCHORS}|${SIMPLE_FILLERS})(?: |$))+$`);
const SIMPLE_ANCHOR = new RegExp(`(?:^| )(?:${SIMPLE_ANCHORS})(?: |$)`);

/**
 * A greeting, thanks or "who are you" and nothing else: one short reply is enough, so the host skips Memory recall, the
 * tool inventory, strategy and Learning review for it. Deliberately narrow: an acknowledgement such as "ok" or "ya" can
 * answer a question Native just asked, so it is not simple. Anything with a path, link, code, a second line or any word
 * outside the greeting vocabulary takes the full path.
 */
export function isSimpleConversation(prompt: string): boolean {
  const raw = prompt.trim();
  if (!raw || raw.length > 60 || /[\n\r`/\\]/.test(raw)) return false;
  const text = raw.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/ +/g, ' ').trim();
  if (!text || text.split(' ').length > 8) return false;
  return SIMPLE_WHOLE.test(text) && SIMPLE_ANCHOR.test(text);
}

export type ToolOutcome ='denied-by-policy' | 'no-answer' | 'technical-failure' | 'interrupted';

const NO_ANSWER = /timed? ?out|timeout|etimedout|econnreset|socket hang up|no (?:response|answer|result|output)|did not (?:answer|respond|return)|deadline|returned nothing/i;

/** For a tool that was dispatched and failed: did it fail, or did it simply not answer? */
export function classifyToolFailure(text: string): ToolOutcome {
  return !text.trim() || NO_ANSWER.test(text) ? 'no-answer' : 'technical-failure';
}

/** The sentence that follows the raw tool error, one per cause. */
export function toolOutcomeNote(outcome: ToolOutcome): string {
  switch (outcome) {
    case 'denied-by-policy':
      return 'TOOL_OUTCOME: denied-by-policy. The tool was not called. Changing the arguments will not help; request the needed capability first or choose another route.';
    case 'interrupted':
      return 'TOOL_OUTCOME: interrupted. Agent Core restarted or the turn was stopped while this tool was running, so its effect is unknown: it may have finished, partly finished, or still be running. It was not run again. Check the current state before doing it again.';
    case 'no-answer':
      return 'TOOL_OUTCOME: no-answer. The tool gave no usable answer in time, so its effect is unknown. Check the current state before repeating anything that changes state.';
    default:
      return 'TOOL_OUTCOME: technical-failure. The tool ran and failed. Read the error, then change the approach before retrying.';
  }
}

/** A tool that succeeded but returned no text must not look like a missing result. */
export function visibleToolText(text: string): string {
  return text.trim() ? text : 'TOOL_RESULT_EMPTY: the tool succeeded and returned no text. That is an empty result, not a missing one.';
}
