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
};

export type AIChatOutput = {
  provider: AIProviderName;
  content: string;
  raw?: unknown;
};