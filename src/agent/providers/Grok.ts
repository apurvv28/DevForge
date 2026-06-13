import OpenAI from 'openai';
import { LLMProvider, AgentMessage, ChatOptions } from './types';
import { withTimeout } from './timeout';

const GROK_BASE_URL = 'https://api.x.ai/v1';
const MODEL_ID = 'grok-3-mini';

export class GrokProvider implements LLMProvider {
  readonly name = 'grok';

  constructor(private readonly credentials: Record<string, string>) {}

  private getClient(): OpenAI | null {
    const apiKey = this.credentials.GROK_API_KEY;
    if (!apiKey) return null;
    return new OpenAI({ apiKey, baseURL: GROK_BASE_URL });
  }

  async chat(messages: AgentMessage[], options?: ChatOptions): Promise<string> {
    const client = this.getClient();
    if (!client) throw new Error('GROK_API_KEY is required');

    const mapped: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (options?.systemPrompt) mapped.push({ role: 'system', content: options.systemPrompt });
    for (const m of messages) {
      if (m.role === 'system' && options?.systemPrompt) continue;
      mapped.push({ role: m.role, content: m.content });
    }

    const response = await withTimeout(
      client.chat.completions.create({
        model: MODEL_ID,
        messages: mapped,
        max_tokens: options?.maxTokens,
        temperature: options?.temperature,
      }),
      this.name,
    );

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error('grok returned an empty response');
    return text;
  }

  async isAvailable(): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    try {
      await withTimeout(client.models.list(), this.name);
      return true;
    } catch {
      return false;
    }
  }
}
