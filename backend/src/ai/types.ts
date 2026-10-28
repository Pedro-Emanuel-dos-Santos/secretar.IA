import type { UsageReport } from "../domain/ai.usage";

export type AIProviderName = "openai" | "ollama" | "rules";

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIChatInput = {
  messages: AIMessage[];
  temperature?: number;
  jsonMode?: boolean;
  task?: "conversation" | "intent" | "reminder" | "finance" | "agenda";
  currentMessage?: string;
};

export type AIChatOutput = {
  provider: AIProviderName;
  content: string;
  raw?: unknown;
  usage?: UsageReport;
};
