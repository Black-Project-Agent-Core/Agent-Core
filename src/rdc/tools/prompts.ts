import { ServerResult } from '../types.js';
import promptsData from '../data/onboarding-prompts.json' with { type: 'json' };

interface Prompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
  categories: string[];
  secondaryTag?: string;
  votes: number;
  gaClicks: number;
  icon: string;
  author: string;
  verified: boolean;
}

export interface PromptsData {
  version: string;
  description: string;
  prompts: Prompt[];
}

interface GetPromptsParams {
  action: 'get_prompt';
  promptId: string;
}

let cachedPromptsData: PromptsData | null = null;

/** Load the bundled onboarding prompt data emitted with the production build. */
export async function loadPromptsData(): Promise<PromptsData> {
  if (!cachedPromptsData) cachedPromptsData = promptsData as PromptsData;
  return cachedPromptsData;
}

/** Retrieve one of the five documented onboarding prompts by ID. */
export async function getPrompts(params: unknown): Promise<ServerResult> {
  try {
    const { action, promptId } = (params ?? {}) as Partial<GetPromptsParams>;
    if (action !== 'get_prompt') {
      return {
        content: [{ type: 'text', text: "? Error: Only action='get_prompt' is supported." }],
        isError: true,
      };
    }
    if (!promptId) {
      return {
        content: [{ type: 'text', text: "? Error: promptId is required when action='get_prompt'." }],
        isError: true,
      };
    }
    return await getPrompt(promptId);
  } catch (error) {
    return {
      content: [{ type: 'text', text: `? Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function getPrompt(promptId: string): Promise<ServerResult> {
  const data = await loadPromptsData();
  const prompt = data.prompts.find((item) => item.id === promptId);
  if (!prompt) {
    return {
      content: [{
        type: 'text',
        text: `? Prompt with ID '${promptId}' not found. Valid bundled IDs are onb2_01 through onb2_05.`,
      }],
      isError: true,
    };
  }

  return { content: [{ type: 'text', text: formatPromptResponse(prompt) }] };
}

function formatPromptResponse(prompt: Prompt): string {
  const verifiedBadge = prompt.verified ? ' ?' : '';
  const categoryText = prompt.categories.join(', ');
  return [
    `# ?? ${prompt.title}${verifiedBadge}`,
    '',
    `**Category:** ${categoryText} ? **Author:** ${prompt.author}`,
    '',
    `## Description`,
    prompt.description,
    '',
    `## Prompt Content`,
    `The text below is returned to the calling controller; this tool does not execute it by itself.`,
    '',
    '---',
    '',
    prompt.prompt,
  ].join('\n');
}
