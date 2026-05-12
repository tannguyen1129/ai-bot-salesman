import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

class EnvSchema {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PORT?: number;

  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @IsOptional()
  @IsString()
  POSTGRES_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  POSTGRES_PORT?: number;

  @IsOptional()
  @IsString()
  POSTGRES_DB?: string;

  @IsOptional()
  @IsString()
  POSTGRES_USER?: string;

  @IsOptional()
  @IsString()
  POSTGRES_PASSWORD?: string;

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_PORT?: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  AI_PROVIDER?: string;

  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string;

  @IsOptional()
  @IsString()
  GEMINI_MODEL_FAST?: string;

  @IsOptional()
  @IsString()
  GEMINI_MODEL_BALANCED?: string;

  @IsOptional()
  @IsString()
  GEMINI_MODEL_REASONING?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  GEMINI_REQUEST_TIMEOUT_MS?: number;

  @IsOptional()
  @IsString()
  RAPIDAPI_KEY?: string;

  @IsOptional()
  @IsString()
  HUNTER_API_KEY?: string;

  @IsOptional()
  @IsString()
  APOLLO_API_KEY?: string;

  @IsOptional()
  @IsString()
  APOLLO_BASE_URL?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  APOLLO_TIMEOUT_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  APOLLO_PEOPLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  APOLLO_ENRICH_TOP_N?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  APOLLO_RATE_LIMIT_PER_MINUTE?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  APOLLO_CACHE_TTL_HOURS?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  CRAWLER_TIMEOUT_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  CRAWLER_RATE_LIMIT_PER_MINUTE?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  CRAWLER_CACHE_TTL_HOURS?: number;

  @IsOptional()
  @IsString()
  CRAWLER_USER_AGENT?: string;

  @IsOptional()
  @IsString()
  GOOGLE_SHEETS_PROSPECTS_SHEET_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_SHEETS_TAB_NAME?: string;

  @IsOptional()
  @IsString()
  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?: string;

  @IsOptional()
  @IsString()
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;

  @IsOptional()
  @IsString()
  GOOGLE_APPLICATION_CREDENTIALS?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  GOOGLE_SHEETS_TOKEN_TIMEOUT_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  GOOGLE_SHEETS_APPEND_TIMEOUT_MS?: number;

  @IsOptional()
  @IsString()
  P1_SHEETS_SYNC_FORCE_FAIL?: string;

  @IsOptional()
  @IsString()
  P1_INTERNAL_STORE_FORCE_FAIL?: string;

  @IsOptional()
  @IsString()
  P1_ENABLE_EXTERNAL_SEND?: string;

  @IsOptional()
  @IsString()
  P1_OUTBOUND_REDIRECT_TARGET?: string;

  @IsOptional()
  @IsString()
  P1_SMTP_ALLOWLIST_DOMAINS?: string;

  @IsOptional()
  @IsString()
  P1_EMAIL_SENDER?: string;

  @IsOptional()
  @IsString()
  P1_SMTP_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  P1_SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  P1_SMTP_SECURE?: string;

  @IsOptional()
  @IsString()
  P1_SMTP_USER?: string;

  @IsOptional()
  @IsString()
  P1_SMTP_PASS?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_REVIEW_CHAT_ID?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_REVIEW_WHITELIST_IDS?: string;

  @IsOptional()
  @IsString()
  P1_BOUNCE_LISTENER_ENABLED?: string;

  @IsOptional()
  @IsString()
  P1_IMAP_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  P1_IMAP_PORT?: number;

  @IsOptional()
  @IsString()
  P1_IMAP_SECURE?: string;

  @IsOptional()
  @IsString()
  P1_IMAP_USER?: string;

  @IsOptional()
  @IsString()
  P1_IMAP_PASS?: string;

  @IsOptional()
  @IsString()
  P1_IMAP_MAILBOX?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  P1_BOUNCE_POLL_INTERVAL_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  P1_BOUNCE_SOFT_MAX?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  P1_BOUNCE_SUPPRESS_DAYS?: number;
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvSchema, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return config;
}
