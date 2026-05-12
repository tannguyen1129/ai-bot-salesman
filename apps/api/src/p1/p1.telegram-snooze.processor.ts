import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../database/pg.service';
import { P1TelegramService } from './p1.telegram.service';

interface SnoozePayload {
  draftId: string;
}

interface DraftSnoozeRow {
  id: string;
  status: string;
  subject: string;
  body_text: string;
  snoozed_until: string | null;
  tg_review_chat_id: string | null;
  tg_review_message_id: number | null;
  company: string | null;
  person_name: string | null;
  intended_recipient: string | null;
}

@Injectable()
@Processor('p1-telegram-snooze')
export class P1TelegramSnoozeProcessor extends WorkerHost {
  private readonly logger = new Logger(P1TelegramSnoozeProcessor.name);

  constructor(private readonly pg: PgService, private readonly telegram: P1TelegramService) {
    super();
  }

  async process(job: Job<SnoozePayload>): Promise<void> {
    const { draftId } = job.data;
    const rows = await this.pg.query<DraftSnoozeRow>(
      `SELECT d.id, d.status, d.subject, d.body_text, d.snoozed_until,
              d.tg_review_chat_id, d.tg_review_message_id,
              p.company, p.person_name, p.email AS intended_recipient
       FROM drafts d
       LEFT JOIN prospects p ON p.id = d.prospect_id
       WHERE d.id = $1`,
      [draftId]
    );
    const draft = rows[0];
    if (!draft) {
      this.logger.warn(`snooze fire: draft ${draftId} not found`);
      return;
    }
    if (draft.status !== 'pending_review') {
      this.logger.log(`snooze fire: draft ${draftId} not pending (status=${draft.status}), skip`);
      return;
    }
    if (draft.snoozed_until && new Date(draft.snoozed_until).getTime() > Date.now() + 30_000) {
      this.logger.log(`snooze fire early for draft ${draftId}, reschedule by drift`);
      return;
    }

    await this.pg.query(`UPDATE drafts SET snoozed_until = NULL WHERE id = $1`, [draftId]);

    const card = await this.telegram.sendDraftReviewCard({
      draftId,
      company: draft.company ?? 'N/A',
      person: draft.person_name ?? 'N/A',
      intendedRecipient: draft.intended_recipient ?? 'unknown@invalid.local',
      subject: draft.subject,
      bodyText: draft.body_text
    });

    if (card) {
      await this.pg.query(
        `UPDATE drafts
         SET tg_review_chat_id = $2, tg_review_message_id = $3
         WHERE id = $1`,
        [draftId, card.chatId, card.messageId]
      );
    }

    await this.pg.query(
      `INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata)
       VALUES ('system', 'draft.snooze.fired', 'draft', $1, $2::jsonb)`,
      [draftId, JSON.stringify({ rescheduledCard: Boolean(card) })]
    );
  }
}
