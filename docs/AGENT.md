# DevForge Agent System

DevForge v2 introduces an agent-driven workflow layer that adds AI guidance, memory, and adaptive recommendations to the pipeline generation process.

## How the Agent System Works

- The agent coordinates under `devforge agent` and auto-invokes recommendation flows during `devforge init`.
- It uses the current project context and detected metadata to provide actionable findings and expected outputs.
- If an LLM provider is configured, DevForge can enrich recommendations with provider-based reasoning.
- If offline mode is selected, DevForge still runs static analysis and generation logic without remote model calls.

## LLM Provider Setup Guide

DevForge supports the following providers:

- **Amazon Nova Pro**
  - Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_SESSION_TOKEN`.
  - Select the Nova Pro provider during `npx devforge init`.
  - Use `@aws-sdk/client-bedrock-runtime` for requests.
- **Amazon Bedrock Runtime**
  - Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_SESSION_TOKEN`.
  - This provider is available when using Bedrock-compatible models.
- **Gemini**
  - Set `GOOGLE_API_KEY` and `GOOGLE_PROJECT_ID`.
  - Use `@google/generative-ai` for model access.
- **OpenAI**
  - Set `OPENAI_API_KEY`.
  - Uses the official `openai` SDK.
- **Anthropic**
  - Set `ANTHROPIC_API_KEY`.
  - Uses `@anthropic-ai/sdk`.

For all providers:

- Provide credentials via environment variables or the interactive setup prompt.
- Optionally configure `ELASTICSEARCH_URL` and `ELASTICSEARCH_API_KEY` if you want cross-session memory.

### Common Setup Steps

1. Run `npx devforge init`.
2. Choose a provider from the interactive prompt.
3. Enter provider credentials when requested.
4. Optionally configure Elasticsearch memory credentials for cross-session learning.

## Offline Mode

- Offline mode is fully supported in DevForge v2.
- When offline is selected, DevForge continues to generate workflows, analyze IaC, and produce expected outputs without contacting an LLM.
- Offline mode is ideal for air-gapped environments or when AI access is unavailable.

## Cache System Explanation

- DevForge caches detection results and template metadata to make repeated runs faster.
- Cached data is stored in the local `.devforge/` directory.
- Use `devforge cache clear` to purge cached detection state.
- Use `devforge cache stats` to inspect cache age and hit/miss counts.

## Memory System Setup (Amazon Elastic)

- Cross-session memory is backed by Amazon Elastic (Elasticsearch).
- Configure `ELASTICSEARCH_URL` and `ELASTICSEARCH_API_KEY` in your environment or via the interactive prompt.
- Memory is used to surface prior recommendation findings and prevent repeated advice.
- Use `devforge memory:stats` to review project memory health.

## Agent Commands Reference

- `devforge agent status` — show the current agent state, provider connectivity, and memory status.
- `devforge agent reset` — clear agent state and reset memory-backed recommendations.
- `devforge cache clear` — remove cached detection/template data.
- `devforge cache stats` — show cache health and entry counts.
- `devforge memory:stats` — show memory counts, estimated size, and project key.
