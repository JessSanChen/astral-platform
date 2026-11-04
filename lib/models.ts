// Curated model list for the event. The admin console can edit the live list
// (stored in event_settings.enabledModels); this is the seed + fallback.
//
// IMPORTANT: verify each id against OpenRouter the week of the event with
// `npm run check-models`. Model names are deprecated and replaced regularly,
// and a stale id shows up to a participant as a failed conversation.
// `family` drives grouping in the ChatGPT-style dropdown.

export type ModelFamily = "anthropic" | "openai" | "open";

export interface ModelOption {
  id: string; // OpenRouter model id
  displayName: string;
  family: ModelFamily;
  sort: number;
  enabled: boolean;
  note?: string; // short hint shown in the dropdown
}

export const DEFAULT_MODELS: ModelOption[] = [
  // Anthropic (frontier, closed)
  {
    id: "anthropic/claude-opus-4.1",
    displayName: "Claude Opus 4.1",
    family: "anthropic",
    sort: 10,
    enabled: true,
    note: "Most capable Claude",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    displayName: "Claude Sonnet 4.5",
    family: "anthropic",
    sort: 11,
    enabled: true,
    note: "Fast, strong default",
  },
  // OpenAI (frontier, closed)
  {
    id: "openai/gpt-5",
    displayName: "GPT-5",
    family: "openai",
    sort: 20,
    enabled: true,
    note: "OpenAI flagship",
  },
  {
    id: "openai/gpt-5-mini",
    displayName: "GPT-5 mini",
    family: "openai",
    sort: 21,
    enabled: true,
    note: "Faster, cheaper",
  },
  // Open weight (refuse less, widen the dataset)
  {
    id: "meta-llama/llama-4-maverick",
    displayName: "Llama 4 Maverick",
    family: "open",
    sort: 30,
    enabled: true,
    note: "Meta open weight",
  },
  {
    // Replaces qwen/qwen3-235b-a22b, which OpenRouter deprecated on
    // 2026-10-09 and which names this as the migration target. Verify with
    // `npm run check-models` before the event, and note that Alibaba's
    // "Plus" tier is a hosted model rather than an open-weight release, so
    // swap in an open-weight Qwen if that distinction matters for the study.
    id: "qwen/qwen3.7-plus",
    displayName: "Qwen3.7 Plus",
    family: "open",
    sort: 31,
    enabled: true,
    note: "Alibaba",
  },
  {
    id: "deepseek/deepseek-chat-v3.1",
    displayName: "DeepSeek V3.1",
    family: "open",
    sort: 32,
    enabled: true,
    note: "DeepSeek open weight",
  },
  {
    id: "openai/gpt-oss-120b",
    displayName: "gpt-oss 120B",
    family: "open",
    sort: 33,
    enabled: true,
    note: "OpenAI open weight",
  },
];

export const FAMILY_LABELS: Record<ModelFamily, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  open: "Open weight",
};
