import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface DraftCardInput {
  draftId: string;
  company: string;
  person: string;
  intendedRecipient: string;
  subject: string;
  bodyText?: string | null;
  snoozedUntil?: string | null;
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

  getReviewChatId(): string {
    return this.reviewChatId;
  }

  isAllowedUser(userId: number): boolean {
    if (this.whitelist.size === 0) {
      return true;
    }
    return this.whitelist.has(String(userId));
  }

  async sendText(
    chatId: string,
    text: string,
    options?: { parseMode?: 'HTML' | 'MarkdownV2' }
  ): Promise<number | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await this.api.post('/sendMessage', {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        parse_mode: options?.parseMode
      });
      return (res.data?.result?.message_id as number | undefined) ?? null;
    } catch (error) {
      this.logger.warn(`telegram send text failed: ${this.formatAxiosError(error)}`);
      return null;
    }
  }

  /** Escape characters that have special meaning in Telegram HTML parse mode. */
  static escapeHtml(input: string | null | undefined): string {
    if (!input) return '';
    return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async sendForceReplyPrompt(chatId: string, text: string, placeholder?: string): Promise<number | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await this.api.post('/sendMessage', {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: {
          force_reply: true,
          selective: false,
          input_field_placeholder: placeholder?.slice(0, 64)
        }
      });
      return (res.data?.result?.message_id as number | undefined) ?? null;
    } catch (error) {
      this.logger.warn(`telegram force-reply failed: ${this.formatAxiosError(error)}`);
      return null;
    }
  }

  buildDraftCardText(input: DraftCardInput): string {
    const bodyPreview = (input.bodyText ?? '').trim();
    const trimmedBody =
      bodyPreview.length > 900 ? `${bodyPreview.slice(0, 900)}\n...[rút gọn - bấm 👁 Show Full Draft]` : bodyPreview;
    const lines = [
      `📩 P1 Draft Review`,
      `Draft: ${input.draftId}`,
      `Công ty: ${input.company}`,
      `Người nhận: ${input.person}`,
      `Email đích: ${input.intendedRecipient}`,
      `Subject: ${input.subject}`,
      ''
    ];
    if (input.snoozedUntil) {
      lines.push(`⏰ Đang snooze tới: ${input.snoozedUntil}`);
      lines.push('');
    }
    lines.push('Xem trước nội dung:');
    lines.push(trimmedBody || '(trống)');
    return lines.join('\n');
  }

  buildDraftCardKeyboard(draftId: string): InlineButton[][] {
    return [
      [
        { text: '✅ Approve', callback_data: `draft:approve:${draftId}` },
        { text: '✏️ Edit', callback_data: `draft:edit:${draftId}` }
      ],
      [
        { text: '❌ Reject', callback_data: `draft:reject:${draftId}` },
        { text: '⏰ Snooze 1h', callback_data: `draft:snooze:${draftId}` }
      ],
      [{ text: '👁 Show Full Draft', callback_data: `draft:show:${draftId}` }]
    ];
  }

  async sendDraftReviewCard(input: DraftCardInput): Promise<{ chatId: string; messageId: number } | null> {
    if (!this.isConfigured()) return null;
    const text = this.buildDraftCardText(input);
    const payload = {
      chat_id: this.reviewChatId,
      text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: this.buildDraftCardKeyboard(input.draftId)
      }
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const res = await this.api.post('/sendMessage', payload);
        const messageId = res.data?.result?.message_id as number | undefined;
        if (messageId) return { chatId: this.reviewChatId, messageId };
        return null;
      } catch (error) {
        const details = this.formatAxiosError(error);
        this.logger.warn(
          `telegram send draft review failed (attempt ${attempt}/${maxAttempts}) draft=${input.draftId}: ${details}`
        );
        if (attempt >= maxAttempts) return null;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
    return null;
  }

  async sendApproveConfirmCard(input: {
    draftId: string;
    intendedRecipient: string;
    subject: string;
  }): Promise<{ chatId: string; messageId: number } | null> {
    if (!this.isConfigured()) return null;
    const text = [
      '⚠️ Xác nhận gửi email',
      `Draft: ${input.draftId}`,
      `Email đích: ${input.intendedRecipient}`,
      `Subject: ${input.subject}`,
      '',
      'Bấm "Xác nhận gửi" để SMTP đẩy mail đi. Bấm "Quay lại" để hủy thao tác.'
    ].join('\n');

    try {
      const res = await this.api.post('/sendMessage', {
        chat_id: this.reviewChatId,
        text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Xác nhận gửi', callback_data: `draft:approve_confirm:${input.draftId}` },
              { text: '↩ Quay lại', callback_data: `draft:approve_cancel:${input.draftId}` }
            ]
          ]
        }
      });
      const messageId = res.data?.result?.message_id as number | undefined;
      return messageId ? { chatId: this.reviewChatId, messageId } : null;
    } catch (error) {
      this.logger.warn(`telegram approve confirm card failed: ${this.formatAxiosError(error)}`);
      return null;
    }
  }

  async clearInlineKeyboard(chatId: string, messageId: number): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await this.api.post('/editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] }
      });
    } catch (error) {
      // 400 "message is not modified" or "message to edit not found" are non-fatal
      this.logger.debug?.(`telegram clear keyboard skipped: ${this.formatAxiosError(error)}`);
    }
  }

  async appendBannerToText(chatId: string, messageId: number, banner: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await this.api.post('/editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: banner,
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [] }
      });
    } catch (error) {
      this.logger.debug?.(`telegram edit text skipped: ${this.formatAxiosError(error)}`);
    }
  }

  async editDraftCardMarkup(chatId: string, messageId: number, draftId: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await this.api.post('/editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: this.buildDraftCardKeyboard(draftId) }
      });
    } catch (error) {
      this.logger.debug?.(`telegram edit draft card markup skipped: ${this.formatAxiosError(error)}`);
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await this.api.post('/answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text.slice(0, 200),
        show_alert: showAlert
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
      [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
      String(user.id);
    return { id: String(user.id), display };
  }
}
