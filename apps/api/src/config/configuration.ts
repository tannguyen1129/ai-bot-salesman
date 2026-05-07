const defaultPostgres = {
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  db: process.env.POSTGRES_DB ?? 'bot_salesman',
  user: process.env.POSTGRES_USER ?? 'bot_salesman',
  password: process.env.POSTGRES_PASSWORD ?? 'bot_salesman_dev'
};

const fallbackDatabaseUrl = `postgresql://${defaultPostgres.user}:${defaultPostgres.password}@${defaultPostgres.host}:${defaultPostgres.port}/${defaultPostgres.db}`;

export const configuration = () => ({
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? fallbackDatabaseUrl,
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD ?? ''
  },
  rapidApi: {
    key: process.env.RAPIDAPI_KEY,
    host: process.env.RAPIDAPI_LINKEDIN_HOST ?? 'linkedin-api8.p.rapidapi.com',
    baseUrl: process.env.RAPIDAPI_LINKEDIN_BASE_URL ?? 'https://linkedin-api8.p.rapidapi.com',
    timeoutMs: Number(process.env.RAPIDAPI_TIMEOUT_MS ?? 30000),
    rateLimitPerMinute: Number(process.env.RAPIDAPI_RATE_LIMIT_PER_MINUTE ?? 60),
    cacheTtlHours: Number(process.env.RAPIDAPI_CACHE_TTL_HOURS ?? 24)
  },
  hunter: {
    key: process.env.HUNTER_API_KEY,
    baseUrl: process.env.HUNTER_BASE_URL ?? 'https://api.hunter.io',
    timeoutMs: Number(process.env.HUNTER_TIMEOUT_MS ?? 20000),
    contactsLimit: Number(process.env.HUNTER_CONTACTS_LIMIT ?? 5),
    rateLimitPerMinute: Number(process.env.HUNTER_RATE_LIMIT_PER_MINUTE ?? 30),
    cacheTtlHours: Number(process.env.HUNTER_CACHE_TTL_HOURS ?? 24)
  },
  apollo: {
    key: process.env.APOLLO_API_KEY,
    baseUrl: process.env.APOLLO_BASE_URL ?? 'https://api.apollo.io/api/v1',
    timeoutMs: Number(process.env.APOLLO_TIMEOUT_MS ?? 30000),
    peopleLimit: Number(process.env.APOLLO_PEOPLE_LIMIT ?? 5),
    enrichTopN: Number(process.env.APOLLO_ENRICH_TOP_N ?? 2),
    rateLimitPerMinute: Number(process.env.APOLLO_RATE_LIMIT_PER_MINUTE ?? 30),
    cacheTtlHours: Number(process.env.APOLLO_CACHE_TTL_HOURS ?? 24)
  },
  crawler: {
    timeoutMs: Number(process.env.CRAWLER_TIMEOUT_MS ?? 10000),
    rateLimitPerMinute: Number(process.env.CRAWLER_RATE_LIMIT_PER_MINUTE ?? 20),
    cacheTtlHours: Number(process.env.CRAWLER_CACHE_TTL_HOURS ?? 24),
    userAgent: process.env.CRAWLER_USER_AGENT ?? 'sale-man-crawler/1.0 (+https://example.local)'
  },
  googleSheets: {
    prospectsSheetId: process.env.GOOGLE_SHEETS_PROSPECTS_SHEET_ID ?? '',
    tabName: process.env.GOOGLE_SHEETS_TAB_NAME ?? 'Prospects',
    serviceAccountJson: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON ?? '',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
    tokenTimeoutMs: Number(process.env.GOOGLE_SHEETS_TOKEN_TIMEOUT_MS ?? 12000),
    appendTimeoutMs: Number(process.env.GOOGLE_SHEETS_APPEND_TIMEOUT_MS ?? 15000),
    syncForceFail: (process.env.P1_SHEETS_SYNC_FORCE_FAIL ?? 'false') === 'true'
  },
  openAi: {
    key: process.env.OPENAI_API_KEY,
    modelBalanced: process.env.OPENAI_MODEL_BALANCED ?? 'gpt-5.5',
    timeoutMs: Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 90000)
  },
  p1Email: {
    enableExternalSend: (process.env.P1_ENABLE_EXTERNAL_SEND ?? 'false') === 'true',
    outboundRedirectTarget: process.env.P1_OUTBOUND_REDIRECT_TARGET ?? 'tandtnt18@gmail.com',
    sender: process.env.P1_EMAIL_SENDER ?? 'p1-demo@vnetwork.vn',
    smtpAllowlistDomains: (process.env.P1_SMTP_ALLOWLIST_DOMAINS ?? 'gmail.com,vnetwork.vn')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN ?? '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    reviewChatId: process.env.TELEGRAM_REVIEW_CHAT_ID ?? '',
    whitelistIds: (process.env.TELEGRAM_REVIEW_WHITELIST_IDS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
});
