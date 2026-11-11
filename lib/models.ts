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

// Chosen from OpenRouter's public list on 2026-11-11, taking the newest
// general-purpose models in each family. Prices are per million tokens,
// input / output, as listed that day.
//
// The first entry is what a new conversation starts on.
export const DEFAULT_MODELS: ModelOption[] = [
  // Anthropic (frontier, closed)
  {
    id: "anthropic/claude-fable-5.2", // $8 / $40
    displayName: "Claude Fable 5.2",
    family: "anthropic",
    sort: 10,
    enabled: true,
    note: "Anthropic's most capable",
  },
  {
    id: "anthropic/claude-opus-5.5", // $4 / $20
    displayName: "Claude Opus 5.5",
    family: "anthropic",
    sort: 11,
    enabled: true,
    note: "Flagship Opus",
  },
  {
    id: "anthropic/claude-sonnet-5.5", // $2 / $10
    displayName: "Claude Sonnet 5.5",
    family: "anthropic",
    sort: 12,
    enabled: true,
    note: "Faster, everyday work",
  },
  // OpenAI (frontier, closed)
  {
    id: "openai/gpt-6-astra", // $10 / $50
    displayName: "GPT-6 Astra",
    family: "openai",
    sort: 20,
    enabled: true,
    note: "OpenAI flagship",
  },
  {
    id: "openai/gpt-6.1-sol", // $2 / $10
    displayName: "GPT-6.1 Sol",
    family: "openai",
    sort: 21,
    enabled: true,
    note: "High-end, newest series",
  },
  {
    id: "openai/gpt-6.1-terra", // $1 / $5
    displayName: "GPT-6.1 Terra",
    family: "openai",
    sort: 22,
    enabled: true,
    note: "Mid-tier, faster",
  },
  // Open weight (refuse less, widen the dataset). Only models that
  // OpenRouter's own listing describes as open-weight are put under this
  // heading. DeepSeek's current models are not described that way there, so
  // none is included; add one if you know its weights are published.
  {
    id: "meta/muse-spark-open", // $1.25 / $4.25
    displayName: "Muse Spark Open",
    family: "open",
    sort: 30,
    enabled: true,
    note: "Meta",
  },
  {
    id: "qwen/qwen3.8-2.4t-a95b", // $2 / $6
    displayName: "Qwen3.8 2.4T",
    family: "open",
    sort: 31,
    enabled: true,
    note: "Alibaba, open variant of Qwen3.8 Max",
  },
  {
    id: "moonshotai/kimi-k3.1-pro", // $2 / $10
    displayName: "Kimi K3.1 Pro",
    family: "open",
    sort: 32,
    enabled: true,
    note: "Moonshot AI",
  },
  {
    id: "meta/muse-glimmer-30b", // $0.30 / $1.20
    displayName: "Muse Glimmer 30B",
    family: "open",
    sort: 33,
    enabled: true,
    note: "Meta, small",
  },
];

export const FAMILY_LABELS: Record<ModelFamily, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  open: "Open weight",
};
