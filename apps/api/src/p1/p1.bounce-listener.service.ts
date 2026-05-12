import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ImapFlow, FetchMessageObject } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { PgService } from '../database/pg.service';
import { P1TelegramService } from './p1.telegram.service';

type BounceType = 'hard_bounce' | 'soft_bounce' | 'spam_block' | 'quota_full' | 'temp_unavailable' | 'unknown';

interface ImapConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  pollIntervalMs: number;
  softMax: number;
  suppressDays: number;
  socketTimeoutMs: number;
  role: 'worker' | 'api' | '';
}

interface ParsedDsn {
  recipient: string | null;
  statusCode: string | null;
  diagnosticCode: string | null;
  originalMessageId: string | null;
  draftIdHint: string | null;
  bounceType: BounceType;
}

interface EmailHistoryHit {
  id: string;
  draft_id: string | null;
  intended_recipient: string;
  message_id: string | null;
}

interface DraftRow {
  id: string;
  prospect_id: string | null;
}

interface CursorRow {
  mailbox: string;
  uid_validity: string | null;
  last_uid: string | null;
}

@Injectable()
export class P1BounceListenerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(P1BounceListenerService.name);
  private readonly cfg: ImapConfig;
  private client: ImapFlow | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly pg: PgService,
    private readonly telegram: P1TelegramService
  ) {
    this.cfg = this.loadConfig();
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.cfg.enabled) {
      this.logger.log('Bounce listener disabled (P1_BOUNCE_LISTENER_ENABLED!=true)');
      return;
    }
    if (this.cfg.role && this.cfg.role !== this.detectProcessRole()) {
      this.logger.log(
        `Bounce listener skipped in this process (role=${this.detectProcessRole()}, required=${this.cfg.role})`
      );
      return;
    }
    if (!this.cfg.user || !this.cfg.pass) {
      this.logger.warn('Bounce listener missing P1_IMAP_USER or P1_IMAP_PASS, skipping startup');
      return;
    }
    this.logger.log(
      `Bounce listener starting: ${this.cfg.user}@${this.cfg.host}:${this.cfg.port} mailbox=${this.cfg.mailbox}`
    );
    this.schedule(this.cfg.pollIntervalMs);
  }

  private detectProcessRole(): 'api' | 'worker' {
    const explicit = (process.env.P1_PROCESS_ROLE ?? '').trim().toLowerCase();
    if (explicit === 'worker' || explicit === 'api') return explicit;
    const argv = process.argv[1] ?? '';
    return argv.endsWith('worker.js') || argv.endsWith('worker.ts') ? 'worker' : 'api';
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.client) {
      try {
        await this.client.logout();
      } catch (error) {
        this.logger.warn(`IMAP logout failed: ${(error as Error).message}`);
      }
      this.client = null;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) {
      this.schedule(this.cfg.pollIntervalMs);
      return;
    }
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`Bounce poll cycle failed: ${(error as Error).message}`);
      await this.closeQuietly();
    } finally {
      this.running = false;
      this.schedule(this.cfg.pollIntervalMs);
    }
  }

  private async ensureClient(): Promise<ImapFlow> {
    if (this.client && this.client.usable) return this.client;
    if (this.client) await this.closeQuietly();

    const client = new ImapFlow({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.secure,
      auth: { user: this.cfg.user, pass: this.cfg.pass },
      logger: false,
      socketTimeout: this.cfg.socketTimeoutMs
    });

    // CRITICAL: attach handlers BEFORE connect(). Without these, any async socket
    // error inside imapflow bubbles out as an Unhandled 'error' event and crashes
    // the entire Node process (taking the whole API down with it).
    client.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`IMAP client error event (will reconnect): ${message}`);
      this.client = null;
    });
    client.on('close', () => {
      if (this.client === client) {
        this.client = null;
      }
    });

    try {
      await client.connect();
    } catch (error) {
      this.client = null;
      // IMPORTANT: do NOT call removeAllListeners() here. ImapFlow schedules its
      // socket cleanup via setImmediate, which can fire additional 'error' events
      // on the instance AFTER we throw. Keep our error handler attached so those
      // late events are swallowed instead of crashing the Node process.
      throw error;
    }
    this.client = client;
    return client;
  }

  private async closeQuietly(): Promise<void> {
    if (!this.client) return;
    const dead = this.client;
    this.client = null;
    try {
      // close() is local (no server round-trip), safer than logout() on a broken client.
      // Keep our 'error'/'close' listeners attached on the dead instance so any
      // straggler events get swallowed by our handlers, not the process.
      dead.close();
    } catch {
      // ignore
    }
  }

  async runOnce(): Promise<{ scanned: number; bounces: number }> {
    const client = await this.ensureClient();
    const lock = await client.getMailboxLock(this.cfg.mailbox);
    let scanned = 0;
    let bounces = 0;
    try {
      const mailboxInfo = client.mailbox as { uidValidity?: bigint | number; uidNext?: number };
      const uidValidity =
        typeof mailboxInfo.uidValidity === 'bigint' ? Number(mailboxInfo.uidValidity) : mailboxInfo.uidValidity ?? 0;
      const cursor = await this.loadCursor();

      let sinceUid: number;
      if (!cursor || (cursor.uid_validity && Number(cursor.uid_validity) !== uidValidity)) {
        // Fresh start or UIDVALIDITY changed: take only new arrivals from now on
        sinceUid = Math.max(0, (mailboxInfo.uidNext ?? 1) - 1);
      } else {
        sinceUid = cursor.last_uid ? Number(cursor.last_uid) : 0;
      }

      const lowerBound = sinceUid + 1;
      let highestUid = sinceUid;

      for await (const message of client.fetch(
        { uid: `${lowerBound}:*` },
        { uid: true, source: true, envelope: true, internalDate: true }
      )) {
        scanned += 1;
        highestUid = Math.max(highestUid, message.uid);
        try {
          const handled = await this.handleMessage(message);
          if (handled) bounces += 1;
        } catch (error) {
          this.logger.error(`Failed handling UID=${message.uid}: ${(error as Error).message}`);
        }
      }

      await this.saveCursor(uidValidity, highestUid);
      if (scanned > 0) {
        this.logger.log(`Bounce poll: scanned=${scanned} bounces=${bounces} lastUid=${highestUid}`);
      }
    } finally {
      lock.release();
    }
    return { scanned, bounces };
  }

  private async handleMessage(message: FetchMessageObject): Promise<boolean> {
    if (!message.source) return false;
    const parsed = await simpleParser(message.source as Buffer);

    if (this.looksLikeDsn(parsed)) {
      return this.handleBounce(message, parsed);
    }

    const replyMatch = await this.detectReplyMatch(parsed);
    if (replyMatch) {
      return this.handleReply(message, parsed, replyMatch);
    }

    return false;
  }

  private async handleBounce(message: FetchMessageObject, parsed: ParsedMail): Promise<boolean> {
    const dsn = this.extractDsn(parsed);
    if (!dsn.recipient && !dsn.originalMessageId && !dsn.draftIdHint) {
      this.logger.warn(`DSN UID=${message.uid} has no recipient/message-id/draft hint; logging raw only`);
    }

    const history = await this.findEmailHistory(dsn);
    let prospectId: string | null = null;
    if (history?.draft_id) {
      const drafts = await this.pg.query<DraftRow>(`SELECT id, prospect_id FROM drafts WHERE id = $1`, [history.draft_id]);
      prospectId = drafts[0]?.prospect_id ?? null;
    }

    const recipient = (dsn.recipient ?? history?.intended_recipient ?? null)?.toLowerCase() ?? null;
    const bounceType = await this.classifyAndCountBounce(recipient, dsn.bounceType);

    const rawSource =
      typeof message.source === 'string' ? message.source : Buffer.from(message.source as Buffer).toString('utf8');
    const inserted = await this.pg.query<{ id: string }>(
      `INSERT INTO bounces (
         email_history_id, draft_id, prospect_id, bounce_type, diagnostic_code,
         status_code, recipient, message_id_ref, imap_uid, raw_dsn, parsed_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT (message_id_ref, recipient) DO NOTHING
       RETURNING id`,
      [
        history?.id ?? null,
        history?.draft_id ?? null,
        prospectId,
        bounceType,
        dsn.diagnosticCode,
        dsn.statusCode,
        recipient,
        dsn.originalMessageId,
        message.uid,
        rawSource.slice(0, 64000),
        JSON.stringify({
          subject: parsed.subject ?? null,
          from: parsed.from?.text ?? null,
          headers: this.headerSample(parsed),
          draftIdHint: dsn.draftIdHint
        })
      ]
    );

    if (inserted.length === 0) {
      // duplicate, skip
      return false;
    }

    if (history) {
      await this.pg.query(
        `UPDATE email_history SET status='bounced', bounced_at=now(), bounce_type=$2 WHERE id=$1`,
        [history.id, bounceType]
      );
    }

    if (history?.draft_id) {
      await this.pg.query(
        `UPDATE drafts SET status='bounced' WHERE id=$1 AND status IN ('sent','approved')`,
        [history.draft_id]
      );
    }

    if (recipient && (bounceType === 'hard_bounce' || bounceType === 'spam_block')) {
      await this.suppressEmail(recipient, bounceType);
      if (prospectId) {
        await this.pg.query(
          `UPDATE prospects SET status='dropped', updated_at=now() WHERE id=$1 AND status <> 'dropped'`,
          [prospectId]
        );
      }
    }

    await this.alertTelegram({
      bounceType,
      recipient,
      diagnosticCode: dsn.diagnosticCode,
      statusCode: dsn.statusCode,
      draftId: history?.draft_id ?? dsn.draftIdHint ?? null
    });

    await this.pg.query(
      `INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata)
       VALUES ('system', 'email.bounce.detected', 'bounce', $1, $2::jsonb)`,
      [
        inserted[0].id,
        JSON.stringify({
          bounceType,
          recipient,
          statusCode: dsn.statusCode,
          draftId: history?.draft_id ?? null,
          messageIdRef: dsn.originalMessageId
        })
      ]
    );

    return true;
  }

  private async detectReplyMatch(parsed: ParsedMail): Promise<EmailHistoryHit | null> {
    const inReplyTo = this.extractMessageIdToken(parsed.headers.get('in-reply-to'));
    const references = this.extractAllMessageIds(parsed.headers.get('references'));
    const candidates = Array.from(new Set([inReplyTo, ...references].filter(Boolean) as string[]));
    if (candidates.length === 0) return null;

    const rows = await this.pg.query<EmailHistoryHit>(
      `SELECT id, draft_id, intended_recipient, message_id
       FROM email_history
       WHERE message_id = ANY($1::text[])
       ORDER BY created_at DESC
       LIMIT 1`,
      [candidates]
    );
    return rows[0] ?? null;
  }

  private extractMessageIdToken(value: unknown): string | null {
    if (!value) return null;
    const raw = typeof value === 'string' ? value : (value as { text?: string }).text ?? '';
    const m = raw.match(/<[^>]+>/);
    return m ? m[0] : null;
  }

  private extractAllMessageIds(value: unknown): string[] {
    if (!value) return [];
    const raw = typeof value === 'string' ? value : (value as { text?: string }).text ?? '';
    return Array.from(raw.matchAll(/<[^>]+>/g)).map((match) => match[0]);
  }

  private async handleReply(
    message: FetchMessageObject,
    parsed: ParsedMail,
    history: EmailHistoryHit
  ): Promise<boolean> {
    const fromAddr = parsed.from?.value?.[0];
    const fromEmail = (fromAddr?.address ?? '').toLowerCase();
    const fromName = fromAddr?.name ?? null;

    // Don't treat our own outbound (Sent label landing in INBOX) as reply.
    const ourSender = (process.env.P1_EMAIL_SENDER ?? '').toLowerCase();
    if (fromEmail && ourSender && fromEmail === ourSender) return false;

    const toAddr = parsed.to ? (Array.isArray(parsed.to) ? parsed.to[0] : parsed.to) : undefined;
    const toEmail = (toAddr?.value?.[0]?.address ?? '').toLowerCase() || null;

    const inReplyTo = this.extractMessageIdToken(parsed.headers.get('in-reply-to'));
    const referencesText =
      typeof parsed.headers.get('references') === 'string'
        ? (parsed.headers.get('references') as string)
        : (parsed.headers.get('references') as { text?: string } | undefined)?.text ?? null;
    const replyMessageId = this.extractMessageIdToken(parsed.headers.get('message-id'));

    let prospectId: string | null = null;
    if (history.draft_id) {
      const rows = await this.pg.query<{ prospect_id: string | null }>(
        `SELECT prospect_id FROM drafts WHERE id = $1`,
        [history.draft_id]
      );
      prospectId = rows[0]?.prospect_id ?? null;
    }

    const bodyText = (parsed.text ?? '').trim();
    const bodyHtmlSnippet = (parsed.html || '').toString().slice(0, 8000) || null;

    const inserted = await this.pg.query<{ id: string }>(
      `INSERT INTO email_replies (
         email_history_id, draft_id, prospect_id, from_email, from_name, to_email,
         subject, body_text, body_html_snippet, in_reply_to, references_header,
         imap_uid, message_id, received_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, now()))
       ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        history.id,
        history.draft_id,
        prospectId,
        fromEmail || null,
        fromName,
        toEmail,
        parsed.subject ?? null,
        bodyText.slice(0, 32000),
        bodyHtmlSnippet,
        inReplyTo,
        referencesText,
        message.uid,
        replyMessageId,
        parsed.date ? parsed.date.toISOString() : null
      ]
    );

    if (inserted.length === 0) {
      // Duplicate by message_id — already processed.
      return false;
    }

    if (prospectId) {
      await this.pg.query(
        `UPDATE prospects
         SET status = 'replied', updated_at = now()
         WHERE id = $1 AND status <> 'replied'`,
        [prospectId]
      );
    }

    await this.alertReplyTelegram({
      replyId: inserted[0].id,
      draftId: history.draft_id,
      prospectId,
      fromEmail: fromEmail || 'không rõ',
      subject: parsed.subject ?? '(không có subject)',
      bodyText
    });

    await this.pg.query(
      `INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata)
       VALUES ('system', 'email.reply.received', 'email_reply', $1, $2::jsonb)`,
      [
        inserted[0].id,
        JSON.stringify({
          draftId: history.draft_id,
          prospectId,
          fromEmail,
          inReplyTo,
          messageId: replyMessageId
        })
      ]
    );

    return true;
  }

  private async alertReplyTelegram(input: {
    replyId: string;
    draftId: string | null;
    prospectId: string | null;
    fromEmail: string;
    subject: string;
    bodyText: string;
  }): Promise<void> {
    if (!this.telegram.isConfigured()) return;
    const chatId = (process.env.TELEGRAM_REVIEW_CHAT_ID ?? '').trim();
    if (!chatId) return;

    let personName = 'Không rõ';
    let company = 'Không rõ';
    if (input.prospectId) {
      const rows = await this.pg.query<{ company: string | null; person_name: string | null }>(
        `SELECT company, person_name FROM prospects WHERE id = $1`,
        [input.prospectId]
      );
      const p = rows[0];
      if (p) {
        personName = p.person_name ?? personName;
        company = p.company ?? company;
      }
    }

    const cleanSubject = this.stripDemoPrefix(input.subject);
    const replyOnly = this.extractReplyText(input.bodyText);
    const trimmedReply = replyOnly.length > 500 ? `${replyOnly.slice(0, 500)}…` : replyOnly;
    const draftShort = input.draftId ? input.draftId.slice(0, 8) : 'n/a';

    const E = P1TelegramService.escapeHtml;
    const html = [
      '💬 <b>Prospect vừa reply</b>',
      '',
      `👤 <b>${E(personName)}</b> · ${E(company)}`,
      `✉️ <code>${E(input.fromEmail)}</code>`,
      `📝 ${E(cleanSubject)}`,
      '',
      '<b>Nội dung trả lời</b>',
      `<blockquote>${E(trimmedReply || '(trống)')}</blockquote>`,
      '',
      `🔖 Draft <code>${E(draftShort)}</code>`
    ].join('\n');

    await this.telegram.sendText(chatId, html, { parseMode: 'HTML' });
    await this.pg.query(`UPDATE email_replies SET alerted_at = now() WHERE id = $1`, [input.replyId]);
  }

  /**
   * Strip the quoted previous-message section from a reply body.
   * Heuristics:
   *  1. Cut at the first "Vào ... đã viết:" / "On ... wrote:" header.
   *  2. Cut at "-----Original Message-----" or "From: ... Sent: ...".
   *  3. Strip remaining lines starting with `>`.
   */
  private extractReplyText(body: string): string {
    if (!body) return '';
    const cutPatterns: RegExp[] = [
      /^.*Vào\s+.+đã viết\s*:.*$/im,
      /^.*On\s+.+wrote\s*:.*$/im,
      /^-----Original Message-----.*$/im,
      /^From:\s.+\nSent:\s.+$/im
    ];

    let earliest = body.length;
    for (const re of cutPatterns) {
      const m = re.exec(body);
      if (m && m.index < earliest) earliest = m.index;
    }
    const head = body.slice(0, earliest);

    return head
      .split('\n')
      .filter((line) => !/^\s*>/.test(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Remove the leading "[P1-DEMO -> recipient@x] " banner from a display subject. */
  private stripDemoPrefix(subject: string): string {
    return subject.replace(/^\[P1-DEMO -> [^\]]+\]\s*/i, '').trim();
  }

  private looksLikeDsn(parsed: ParsedMail): boolean {
    const headers = parsed.headers;
    const contentType = (headers.get('content-type') as { value?: string } | string | undefined);
    const ctValue =
      typeof contentType === 'string' ? contentType : (contentType as { value?: string } | undefined)?.value ?? '';
    if (/multipart\/report/i.test(String(ctValue))) return true;

    const from = parsed.from?.value?.[0]?.address ?? parsed.from?.text ?? '';
    if (/(mailer-daemon|postmaster)@/i.test(from)) return true;

    if (headers.has('x-failed-recipients')) return true;

    const autoSubmitted = String(headers.get('auto-submitted') ?? '').toLowerCase();
    if (autoSubmitted.includes('auto-replied') || autoSubmitted.includes('auto-generated')) return true;

    return false;
  }

  private extractDsn(parsed: ParsedMail): ParsedDsn {
    const text = `${parsed.text ?? ''}\n${parsed.html ?? ''}`;
    const headers = parsed.headers;

    let recipient: string | null = null;
    let statusCode: string | null = null;
    let diagnosticCode: string | null = null;
    let originalMessageId: string | null = null;
    let draftIdHint: string | null = null;

    // X-Failed-Recipients header
    const failed = headers.get('x-failed-recipients');
    if (typeof failed === 'string') recipient = failed.split(',')[0].trim();

    // Walk attachments for delivery-status part (message/delivery-status)
    for (const attachment of parsed.attachments ?? []) {
      const ct = attachment.contentType?.toLowerCase() ?? '';
      if (ct.includes('message/delivery-status') || ct.includes('text/rfc822-headers') || ct.includes('message/rfc822')) {
        const body = attachment.content?.toString('utf8') ?? '';
        const finalRecipient = body.match(/Final-Recipient:\s*[a-zA-Z\-]+;\s*([^\r\n]+)/i)?.[1]?.trim();
        if (!recipient && finalRecipient) recipient = finalRecipient;
        const orig = body.match(/Original-Recipient:\s*[a-zA-Z\-]+;\s*([^\r\n]+)/i)?.[1]?.trim();
        if (!recipient && orig) recipient = orig;
        const status = body.match(/Status:\s*([0-9.]+)/i)?.[1]?.trim();
        if (!statusCode && status) statusCode = status;
        const diag = body.match(/Diagnostic-Code:\s*[^;]+;\s*([^\r\n]+(?:\r?\n\s+[^\r\n]+)*)/i)?.[1]?.trim();
        if (!diagnosticCode && diag) diagnosticCode = diag.replace(/\r?\n\s+/g, ' ');
        const draftHeader = body.match(/X-VN-Draft-Id:\s*([^\r\n]+)/i)?.[1]?.trim();
        if (!draftIdHint && draftHeader) draftIdHint = draftHeader;
        const messageIdHeader = body.match(/Message-ID:\s*<([^>]+)>/i)?.[1]?.trim();
        if (!originalMessageId && messageIdHeader) originalMessageId = `<${messageIdHeader}>`;
      }
    }

    // Fallback: scrape body text
    if (!recipient) {
      recipient = text.match(/Final-Recipient:\s*[a-zA-Z\-]+;\s*([^\r\n]+)/i)?.[1]?.trim() ?? null;
    }
    if (!statusCode) {
      statusCode = text.match(/Status:\s*([0-9.]+)/i)?.[1]?.trim() ?? null;
    }
    if (!diagnosticCode) {
      const m = text.match(/Diagnostic-Code:\s*[^;]+;\s*([^\r\n]+)/i);
      if (m) diagnosticCode = m[1].trim();
    }
    if (!originalMessageId) {
      const ref = headers.get('references') ?? headers.get('in-reply-to');
      if (typeof ref === 'string') {
        const m = ref.match(/<[^>]+>/);
        if (m) originalMessageId = m[0];
      }
    }
    if (!draftIdHint) {
      draftIdHint = text.match(/X-VN-Draft-Id:\s*([0-9a-fA-F-]{36})/)?.[1] ?? null;
    }

    const bounceType = this.classifyByStatus(statusCode, diagnosticCode);

    return { recipient, statusCode, diagnosticCode, originalMessageId, draftIdHint, bounceType };
  }

  private classifyByStatus(statusCode: string | null, diagnostic: string | null): BounceType {
    const code = (statusCode ?? '').trim();
    const diag = (diagnostic ?? '').toLowerCase();
    if (code.startsWith('5.1.1') || code.startsWith('5.1.2') || code.startsWith('5.1.10')) return 'hard_bounce';
    if (code.startsWith('5.7') || /spam|blocked|policy/.test(diag)) return 'spam_block';
    if (code.startsWith('5.2.2') || /over\s*quota|mailbox\s*full/.test(diag)) return 'quota_full';
    if (code.startsWith('5.')) return 'hard_bounce';
    if (code.startsWith('4.')) return 'soft_bounce';
    if (/permanent/.test(diag)) return 'hard_bounce';
    if (/temporar/.test(diag)) return 'soft_bounce';
    return 'unknown';
  }

  private headerSample(parsed: ParsedMail): Record<string, string> {
    const wanted = ['content-type', 'subject', 'from', 'date', 'references', 'in-reply-to', 'auto-submitted'];
    const out: Record<string, string> = {};
    for (const key of wanted) {
      const value = parsed.headers.get(key);
      if (typeof value === 'string') out[key] = value;
      else if (value && typeof value === 'object') out[key] = JSON.stringify(value);
    }
    return out;
  }

  private async findEmailHistory(dsn: ParsedDsn): Promise<EmailHistoryHit | null> {
    if (dsn.originalMessageId) {
      const rows = await this.pg.query<EmailHistoryHit>(
        `SELECT id, draft_id, intended_recipient, message_id
         FROM email_history
         WHERE message_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [dsn.originalMessageId]
      );
      if (rows[0]) return rows[0];
    }

    if (dsn.draftIdHint) {
      const rows = await this.pg.query<EmailHistoryHit>(
        `SELECT id, draft_id, intended_recipient, message_id
         FROM email_history
         WHERE draft_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [dsn.draftIdHint]
      );
      if (rows[0]) return rows[0];
    }

    if (dsn.recipient) {
      const rows = await this.pg.query<EmailHistoryHit>(
        `SELECT id, draft_id, intended_recipient, message_id
         FROM email_history
         WHERE intended_recipient = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [dsn.recipient.toLowerCase()]
      );
      if (rows[0]) return rows[0];
    }

    return null;
  }

  private async classifyAndCountBounce(
    recipient: string | null,
    initial: BounceType
  ): Promise<BounceType> {
    if (!recipient || initial !== 'soft_bounce') return initial;
    const rows = await this.pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM bounces
       WHERE recipient = $1
         AND bounce_type IN ('soft_bounce', 'temp_unavailable')
         AND received_at > now() - interval '30 days'`,
      [recipient]
    );
    const prior = Number(rows[0]?.count ?? '0');
    if (prior + 1 >= this.cfg.softMax) return 'hard_bounce';
    return initial;
  }

  private async suppressEmail(email: string, reason: BounceType): Promise<void> {
    const suppressDays = this.cfg.suppressDays;
    await this.pg.query(
      `INSERT INTO email_suppression (email, reason, bounce_count, last_bounce_at, suppressed_until)
       VALUES ($1, $2, 1, now(), now() + ($3 || ' days')::interval)
       ON CONFLICT (email) DO UPDATE
       SET reason = EXCLUDED.reason,
           bounce_count = email_suppression.bounce_count + 1,
           last_bounce_at = now(),
           suppressed_until = GREATEST(COALESCE(email_suppression.suppressed_until, now()), EXCLUDED.suppressed_until)`,
      [email, reason, String(suppressDays)]
    );
  }

  private async alertTelegram(input: {
    bounceType: BounceType;
    recipient: string | null;
    statusCode: string | null;
    diagnosticCode: string | null;
    draftId: string | null;
  }): Promise<void> {
    if (!this.telegram.isConfigured()) return;
    const chatId = (process.env.TELEGRAM_REVIEW_CHAT_ID ?? '').trim();
    if (!chatId) return;
    const E = P1TelegramService.escapeHtml;
    const draftShort = input.draftId ? input.draftId.slice(0, 8) : 'n/a';
    const reason = (input.diagnosticCode ?? 'không rõ').slice(0, 300);
    const action =
      input.bounceType === 'hard_bounce' || input.bounceType === 'spam_block'
        ? `Email đã bị suppress trong <b>${this.cfg.suppressDays} ngày</b>`
        : 'Ghi nhận soft bounce, chưa suppress';

    const html = [
      `⚠️ <b>BOUNCE — ${E(input.bounceType.toUpperCase())}</b>`,
      '',
      `✉️ <code>${E(input.recipient ?? 'không rõ')}</code>`,
      `🔢 Mã: <code>${E(input.statusCode ?? 'n/a')}</code>`,
      `📋 Lý do:`,
      `<blockquote>${E(reason)}</blockquote>`,
      '',
      `🔖 Draft <code>${E(draftShort)}</code>`,
      `🛡 ${action}`
    ].join('\n');
    await this.telegram.sendText(chatId, html, { parseMode: 'HTML' });
  }

  private async loadCursor(): Promise<CursorRow | null> {
    const rows = await this.pg.query<CursorRow>(`SELECT mailbox, uid_validity, last_uid FROM imap_cursors WHERE mailbox=$1`, [
      this.cfg.mailbox
    ]);
    return rows[0] ?? null;
  }

  private async saveCursor(uidValidity: number, lastUid: number): Promise<void> {
    await this.pg.query(
      `INSERT INTO imap_cursors (mailbox, uid_validity, last_uid, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (mailbox) DO UPDATE SET
         uid_validity = EXCLUDED.uid_validity,
         last_uid = GREATEST(imap_cursors.last_uid, EXCLUDED.last_uid),
         updated_at = now()`,
      [this.cfg.mailbox, uidValidity, lastUid]
    );
  }

  private loadConfig(): ImapConfig {
    const roleRaw = (process.env.P1_BOUNCE_LISTENER_ROLE ?? '').trim().toLowerCase();
    const role: ImapConfig['role'] = roleRaw === 'worker' || roleRaw === 'api' ? roleRaw : '';
    return {
      enabled: (process.env.P1_BOUNCE_LISTENER_ENABLED ?? 'false').trim().toLowerCase() === 'true',
      host: (process.env.P1_IMAP_HOST ?? 'imap.gmail.com').trim(),
      port: Number(process.env.P1_IMAP_PORT ?? 993),
      secure: (process.env.P1_IMAP_SECURE ?? 'true').trim().toLowerCase() === 'true',
      user: (process.env.P1_IMAP_USER ?? '').trim(),
      pass: (process.env.P1_IMAP_PASS ?? '').trim(),
      mailbox: (process.env.P1_IMAP_MAILBOX ?? 'INBOX').trim(),
      pollIntervalMs: Number(process.env.P1_BOUNCE_POLL_INTERVAL_MS ?? 60000),
      softMax: Number(process.env.P1_BOUNCE_SOFT_MAX ?? 3),
      suppressDays: Number(process.env.P1_BOUNCE_SUPPRESS_DAYS ?? 30),
      socketTimeoutMs: Number(process.env.P1_IMAP_SOCKET_TIMEOUT_MS ?? 60000),
      role
    };
  }
}
