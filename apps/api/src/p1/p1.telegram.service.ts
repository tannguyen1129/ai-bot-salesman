import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

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
      this.logger.warn(`telegram send text failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async sendDraftReviewCard(input: {
    draftId: string;
    company: string;
    person: string;
    intendedRecipient: string;
    subject: string;
  }): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const text = [
      `P1 Draft Review`,
      `Draft: ${input.draftId}`,
      `Company: ${input.company}`,
      `Person: ${input.person}`,
      `To (intended): ${input.intendedRecipient}`,
      `Subject: ${input.subject}`
    ].join('\n');

    try {
      await this.api.post('/sendMessage', {
        chat_id: this.reviewChatId,
        text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Approve', callback_data: `draft:approve:${input.draftId}` },
              { text: 'Reject', callback_data: `draft:reject:${input.draftId}` }
            ]
          ]
        }
      });
    } catch (error) {
      this.logger.warn(
        `telegram send draft review failed: ${error instanceof Error ? error.message : 'unknown error'}`
      );
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
      this.logger.warn(
        `telegram answer callback failed: ${error instanceof Error ? error.message : 'unknown error'}`
      );
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
