export interface RapidApiConfig {
  baseUrl: string;
  host: string;
  key: string;
  timeoutMs?: number;
}

export interface OpenAiConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}
