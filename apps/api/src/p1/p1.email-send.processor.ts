import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../database/pg.service';

interface SendPayload {
  draftId: string;
}

interface DraftForSend {
  id: string;
  prospect_id: string | null;
  subject: string;
  body_text: string;
  body_html: string | null;
}

interface ProspectRecipient {
  id: string;
  email: string | null;
}

interface FeatureFlagRecord {
  key: string;
  value: unknown;
}

@Injectable()
@Processor('p1-email-send')
export class P1EmailSendProcessor extends WorkerHost {
  private readonly logger = new Logger(P1EmailSendProcessor.name);

  constructor(private readonly pg: PgService) {
    super();
  }

  async process(job: Job<SendPayload>): Promise<void> {
    const draftId = job.data.draftId;

    const drafts = await this.pg.query<DraftForSend>(
      `SELECT id, prospect_id, subject, body_text, body_html
       FROM drafts
       WHERE id = $1`,
      [draftId]
    );

    const draft = drafts[0];
    if (!draft) {
      return;
    }

    let intendedRecipient = 'unknown@invalid.local';
    if (draft.prospect_id) {
      const prospects = await this.pg.query<ProspectRecipient>(`SELECT id, email FROM prospects WHERE id = $1`, [
        draft.prospect_id
      ]);
      intendedRecipient = prospects[0]?.email?.toLowerCase() ?? intendedRecipient;
    }

    const safeConfig = await this.resolveSafeModeConfig();
    const actualRecipient = safeConfig.enableExternalSend
      ? intendedRecipient
      : safeConfig.outboundRedirectTarget.toLowerCase();
    const redirected = actualRecipient !== intendedRecipient;

    const recipientDomain = actualRecipient.split('@')[1]?.toLowerCase() ?? '';
    if (!safeConfig.smtpAllowlistDomains.includes(recipientDomain)) {
      await this.pg.query(
        `INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata)
         VALUES ('system', 'security_violation', 'draft', $1, $2::jsonb)`,
        [
          draftId,
          JSON.stringify({
            reason: 'recipient_domain_not_allowlisted',
            actualRecipient,
            allowlist: safeConfig.smtpAllowlistDomains
          })
        ]
      );
      throw new Error(`recipient domain ${recipientDomain || 'unknown'} is not allowlisted`);
    }

    const subject = redirected ? `[P1-DEMO -> ${intendedRecipient}] ${draft.subject}` : draft.subject;
    const banner = `Day la email Phase 1 demo. Recipient goc: ${intendedRecipient}. Email nay duoc redirect tu dong ve ${actualRecipient}.`;
    const finalText = `${banner}\n\n${draft.body_text}`;
    const finalHtml = draft.body_html
      ? `<div style="background:#fff3cd;border:1px solid #ffe69c;padding:10px;margin-bottom:12px;font-family:Arial,sans-serif;font-size:13px;">${banner}</div>${draft.body_html}`
      : null;

    await this.pg.query(
      `INSERT INTO email_history (
         draft_id, sender, intended_recipient, actual_recipient, redirected,
         subject, body_html_snapshot, message_id, status, sent_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent', now())`,
      [
        draftId,
        process.env.P1_EMAIL_SENDER ?? 'p1-demo@vnetwork.vn',
        intendedRecipient,
        actualRecipient,
        redirected,
        subject,
        finalHtml,
        `p1-demo-${draftId}-${Date.now()}`
      ]
    );

    await this.pg.query(
      `UPDATE drafts
       SET status='sent', sent_at=now()
       WHERE id = $1`,
      [draftId]
    );

    await this.pg.query(
      `INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata)
       VALUES ('system', 'email.sent.safe_mode', 'draft', $1, $2::jsonb)`,
      [
        draftId,
        JSON.stringify({
          intendedRecipient,
          actualRecipient,
          redirected,
          subject,
          textLength: finalText.length
        })
      ]
    );

    this.logger.log(`Draft sent in safe mode: draft=${draftId} intended=${intendedRecipient} actual=${actualRecipient}`);
  }

  private async resolveSafeModeConfig(): Promise<{
    enableExternalSend: boolean;
    outboundRedirectTarget: string;
    smtpAllowlistDomains: string[];
  }> {
    const fallback = {
      enableExternalSend: (process.env.P1_ENABLE_EXTERNAL_SEND ?? 'false') === 'true',
      outboundRedirectTarget: (process.env.P1_OUTBOUND_REDIRECT_TARGET ?? 'tandtnt18@gmail.com').toLowerCase(),
      smtpAllowlistDomains: (process.env.P1_SMTP_ALLOWLIST_DOMAINS ?? 'gmail.com,vnetwork.vn')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    };

    try {
      const rows = await this.pg.query<FeatureFlagRecord>(
        `SELECT key, value
         FROM feature_flags
         WHERE key = ANY($1::text[])`,
        [['enable_external_send', 'outbound_redirect_target', 'smtp_allowlist_domains']]
      );
      const map = new Map(rows.map((row) => [row.key, row.value]));

      return {
        enableExternalSend:
          typeof map.get('enable_external_send') === 'boolean'
            ? (map.get('enable_external_send') as boolean)
            : fallback.enableExternalSend,
        outboundRedirectTarget:
          typeof map.get('outbound_redirect_target') === 'string'
            ? String(map.get('outbound_redirect_target')).toLowerCase()
            : fallback.outboundRedirectTarget,
        smtpAllowlistDomains: Array.isArray(map.get('smtp_allowlist_domains'))
          ? (map
              .get('smtp_allowlist_domains') as unknown[])
              .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              .map((item) => item.trim().toLowerCase())
          : fallback.smtpAllowlistDomains
      };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === '42P01') {
        return fallback;
      }
      throw error;
    }
  }
}
