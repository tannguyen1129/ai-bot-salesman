import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

@Injectable()
export class P1TelegramService {
  private readonly logger = new Logger(P1TelegramService.name);
  private readonly token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  private readonly reviewChatId = (process.env.TELEGRAM_REVIEW_CHAT_ID ?? '').trim();
  private readonly whitelist = new Set(
    (process.env.TELEGRAM_REVIEW_WHITELIST_IDS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
  private readonly api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: this.token ? `https://api.telegram.org/bot${this.token}` : 'https://api.telegram.org',
      timeout: 15000
    });
  }

  private formatAxiosError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const typed = error as AxiosError<{ description?: string }>;
      const status = typed.response?.status ?? 'n/a';
      const code = typed.code ?? 'n/a';
      const description =
        typed.response?.data && typeof typed.response.data === 'object'
          ? typed.response.data.description ?? JSON.stringify(typed.response.data)
          : typed.message || 'unknown';
      return `status=${status} code=${code} detail=${description}`;
    }
    if (error instanceof Error) {
      return error.message || error.name;
    }
    return 'unknown error';
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.reviewChatId);
  }

  isAllowedUser(userId: number): boolean {
    if (this.whitelist.size === 0) {
      return true;
    }
    return this.whitelist.has(String(userId));
  }

  async sendText(chatId: string, text: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }
    try {
      await this.api.post('/sendMessage', {
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      });
    } catch (error) {
      this.logger.warn(`telegram send text failed: ${this.formatAxiosError(error)}`);
    }
  }

  async sendDraftReviewCard(input: {
    draftId: string;
    company: string;
    person: string;
    intendedRecipient: string;
    subject: string;
    bodyText?: string | null;
  }): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const bodyPreview = (input.bodyText ?? '').trim();
    const trimmedBody =
      bodyPreview.length > 900 ? `${bodyPreview.slice(0, 900)}\n...[truncated for Telegram card]` : bodyPreview;

    const text = [
      `P1 Draft Review`,
      `Draft: ${input.draftId}`,
      `Company: ${input.company}`,
      `Person: ${input.person}`,
      `To (intended): ${input.intendedRecipient}`,
      `Subject: ${input.subject}`,
      '',
      `Body preview:`,
      trimmedBody || '(empty)'
    ].join('\n');

    const payload = {
      chat_id: this.reviewChatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Approve', callback_data: `draft:approve:${input.draftId}` },
            { text: 'Reject', callback_data: `draft:reject:${input.draftId}` },
            { text: 'Edit', callback_data: `draft:edit:${input.draftId}` }
          ],
          [{ text: 'Show Full Draft', callback_data: `draft:show:${input.draftId}` }]
        ]
      }
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.api.post('/sendMessage', payload);
        return;
      } catch (error) {
        const details = this.formatAxiosError(error);
        this.logger.warn(
          `telegram send draft review failed (attempt ${attempt}/${maxAttempts}) draft=${input.draftId}: ${details}`
        );
        if (attempt >= maxAttempts) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    try {
      await this.api.post('/answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text,
        show_alert: false
      });
    } catch (error) {
      this.logger.warn(`telegram answer callback failed: ${this.formatAxiosError(error)}`);
    }
  }

  identifyUser(user: TelegramUser | undefined): { id: string; display: string } {
    if (!user) {
      return { id: 'unknown', display: 'unknown' };
    }

    const display =
      user.username ||
      [user.first_name, user.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      String(user.id);

    return {
      id: String(user.id),
      display
    };
  }
}
