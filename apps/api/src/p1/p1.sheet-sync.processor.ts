import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../database/pg.service';
import {
  CleanedProspectForSheet,
  OpenAiClient,
  ProspectRawSnapshot,
  ProspectSheetRecord
} from '../integrations/openai.client';

interface SyncPayload {
  prospectId: string;
}

interface ProspectForSync extends ProspectSheetRecord {
  companyId: string | null;
  contactId: string | null;
}

interface SnapshotRow {
  source: string;
  entity_type: string;
  entity_id: string | null;
  raw_json: unknown;
}

interface StoredProfilePayload {
  id: string;
  company: string;
  person: string;
  email: string | null;
  confidence: number | null;
  sources: string[];
  notes: string | null;
  cleanerMode: 'openai' | 'fallback';
  snapshotsCount: number;
}

@Injectable()
@Processor('p1-sheets-sync')
export class P1SheetSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(P1SheetSyncProcessor.name);

  constructor(
    private readonly pg: PgService,
    private readonly openAi: OpenAiClient
  ) {
    super();
  }

  async process(job: Job<SyncPayload>): Promise<void> {
    const prospectId = job.data.prospectId;

    const rows = await this.pg.query<ProspectForSync>(
      `SELECT
         p.id AS "prospectId",
         p.search_job_id AS "searchJobId",
         p.company_id AS "companyId",
         p.contact_id AS "contactId",
         p.company AS "companyName",
         p.domain AS "companyDomain",
         COALESCE(c.industry, p.industry) AS "companyIndustry",
         c.region AS "companyRegion",
         c.linkedin_url AS "companyLinkedinUrl",
         p.person_name AS "personName",
         p.position AS "personTitle",
         p.email AS "personEmail",
         p.phone AS "personPhone",
         ct.linkedin_url AS "personLinkedinUrl",
         p.status AS "prospectStatus",
         p.source AS "prospectSource",
         p.confidence::text AS "confidence"
       FROM prospects p
       LEFT JOIN companies c ON c.id = p.company_id
       LEFT JOIN contacts ct ON ct.id = p.contact_id
       WHERE p.id = $1`,
      [prospectId]
    );

    if (!rows[0]) {
      return;
    }

    const forceFail =
      (process.env.P1_INTERNAL_STORE_FORCE_FAIL ?? process.env.P1_SHEETS_SYNC_FORCE_FAIL ?? 'false').toLowerCase() ===
      'true';
    if (forceFail) {
      throw new Error('Forced internal profile store failure via env P1_SHEETS_SYNC_FORCE_FAIL=true');
    }

    const snapshots = await this.loadRelevantSnapshots(rows[0]);
    const cleaned = await this.openAi.cleanProspectForSheet({
      prospect: rows[0],
      snapshots
    });

    const cleanerMode: 'openai' | 'fallback' =
      cleaned.notes === 'fallback_cleaner' ? 'fallback' : 'openai';

    await this.upsertInternalProfile(rows[0], cleaned, snapshots, cleanerMode);
    await this.writeAudit(rows[0], cleaned, snapshots, cleanerMode);

    this.logger.log(
      `Prospect ${prospectId} stored internally: mode=${cleanerMode} snapshots=${snapshots.length}`
    );
  }

  private async upsertInternalProfile(
    prospect: ProspectForSync,
    cleaned: CleanedProspectForSheet,
    snapshots: ProspectRawSnapshot[],
    cleanerMode: 'openai' | 'fallback'
  ): Promise<void> {
    const payload: StoredProfilePayload = {
      id: prospect.prospectId,
      company: cleaned.company_name,
      person: cleaned.key_person_name,
      email: cleaned.key_person_email,
      confidence: cleaned.confidence_score,
      sources: cleaned.source_list,
      notes: cleaned.notes,
      cleanerMode,
      snapshotsCount: snapshots.length
    };

    await this.pg.query(
      `INSERT INTO prospect_ai_profiles (
         prospect_id,
         search_job_id,
         company_name,
         company_domain,
         company_industry,
         company_region,
         company_summary,
         key_person_name,
         key_person_title,
         key_person_email,
         key_person_phone,
         key_person_linkedin,
         confidence_score,
         source_list,
         snapshots_count,
         clean_status,
         cleaner_mode,
         notes,
         raw_payload
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14::jsonb, $15, 'stored', $16, $17, $18::jsonb
       )
       ON CONFLICT (prospect_id) DO UPDATE
       SET
         search_job_id = EXCLUDED.search_job_id,
         company_name = EXCLUDED.company_name,
         company_domain = EXCLUDED.company_domain,
         company_industry = EXCLUDED.company_industry,
         company_region = EXCLUDED.company_region,
         company_summary = EXCLUDED.company_summary,
         key_person_name = EXCLUDED.key_person_name,
         key_person_title = EXCLUDED.key_person_title,
         key_person_email = EXCLUDED.key_person_email,
         key_person_phone = EXCLUDED.key_person_phone,
         key_person_linkedin = EXCLUDED.key_person_linkedin,
         confidence_score = EXCLUDED.confidence_score,
         source_list = EXCLUDED.source_list,
         snapshots_count = EXCLUDED.snapshots_count,
         clean_status = EXCLUDED.clean_status,
         cleaner_mode = EXCLUDED.cleaner_mode,
         notes = EXCLUDED.notes,
         raw_payload = EXCLUDED.raw_payload,
         updated_at = now()`,
      [
        prospect.prospectId,
        prospect.searchJobId,
        cleaned.company_name,
        cleaned.company_domain,
        cleaned.company_industry,
        cleaned.company_region,
        cleaned.company_summary,
        cleaned.key_person_name,
        cleaned.key_person_title,
        cleaned.key_person_email,
        cleaned.key_person_phone,
        cleaned.key_person_linkedin,
        cleaned.confidence_score,
        JSON.stringify(cleaned.source_list),
        snapshots.length,
        cleanerMode,
        cleaned.notes,
        JSON.stringify(payload)
      ]
    );
  }

  private async writeAudit(
    prospect: ProspectForSync,
    cleaned: CleanedProspectForSheet,
    snapshots: ProspectRawSnapshot[],
    cleanerMode: 'openai' | 'fallback'
  ): Promise<void> {
    await this.pg.query(
      `INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        'system',
        'prospect.ai_profile.stored',
        'prospect',
        prospect.prospectId,
        JSON.stringify({
          cleanerMode,
          snapshotsCount: snapshots.length,
          confidence: cleaned.confidence_score
        })
      ]
    );
  }

  private async loadRelevantSnapshots(prospect: ProspectForSync): Promise<ProspectRawSnapshot[]> {
    const rows = await this.pg.query<SnapshotRow>(
      `SELECT source, entity_type, entity_id, raw_json
       FROM raw_data_snapshots
       WHERE job_id = $1
       ORDER BY created_at DESC
       LIMIT 80`,
      [prospect.searchJobId]
    );

    const markerSet = new Set(
      [
        prospect.contactId,
        prospect.companyId,
        prospect.companyDomain,
        prospect.companyName,
        prospect.personName,
        prospect.personEmail
      ]
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.toLowerCase())
    );

    const filtered = rows.filter((row) => {
      const entity = row.entity_id?.toLowerCase() ?? '';
      if (entity && markerSet.has(entity)) {
        return true;
      }

      return [
        'company-search',
        'company-profile',
        'company-crawl',
        'people-search',
        'person-enrichment',
        'key-person'
      ].includes(row.entity_type);
    });

    return filtered.slice(0, 30).map((row) => ({
      source: row.source,
      entityType: row.entity_type,
      entityId: row.entity_id,
      rawJson: row.raw_json
    }));
  }
}
