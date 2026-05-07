import { Injectable, NotFoundException } from '@nestjs/common';
import { PgService } from '../database/pg.service';
import { OpenAiClient } from '../integrations/openai.client';

interface CandidateWithContext {
  id: string;
  job_id: string | null;
  name: string;
  domain: string | null;
  linkedin_url: string | null;
  industry: string | null;
  employee_estimate: number | null;
  source_confidence: string | null;
  source_json: unknown;
  icp_id: string | null;
  icp_name: string | null;
  icp_industries: unknown;
  icp_countries: unknown;
  icp_employee_min: number | null;
  icp_target_roles: unknown;
  icp_pain_keywords: unknown;
  icp_product_focus: unknown;
}

interface LeadScoreRecord {
  id: string;
  candidate_id: string | null;
  company_id: string | null;
  score: string;
  score_version: string;
  breakdown_json: unknown;
  ai_explanation: string | null;
  created_at: string;
}

interface AnalysisResult {
  candidateId: string;
  score: number;
  breakdown: Record<string, number>;
  explanation: string;
  scoreRecordId: string;
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly pg: PgService,
    private readonly openAi: OpenAiClient
  ) {}

  async analyzeCandidate(candidateId: string): Promise<AnalysisResult> {
    const candidate = await this.getCandidateWithContext(candidateId);
    const scored = await this.buildScore(candidate);

    const rows = await this.pg.query<LeadScoreRecord>(
      `INSERT INTO lead_scores (
         candidate_id, score, score_version, breakdown_json, ai_explanation
       ) VALUES ($1, $2, 'mvp-v1-auto', $3::jsonb, $4)
       RETURNING *`,
      [candidate.id, scored.score, JSON.stringify(scored.breakdown), scored.explanation]
    );

    await this.pg.query(`UPDATE company_candidates SET score = $2, updated_at = now() WHERE id = $1`, [
      candidate.id,
      scored.score
    ]);

    return {
      candidateId,
      score: scored.score,
      breakdown: scored.breakdown,
      explanation: scored.explanation,
      scoreRecordId: rows[0].id
    };
  }

  async analyzeJobCandidates(jobId: string, limit = 20): Promise<AnalysisResult[]> {
    const rows = await this.pg.query<{ id: string }>(
      `SELECT id
       FROM company_candidates
       WHERE job_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [jobId, limit]
    );

    const results: AnalysisResult[] = [];
    for (const row of rows) {
      results.push(await this.analyzeCandidate(row.id));
    }

    return results;
  }

  async getLatestAnalysis(candidateId: string): Promise<LeadScoreRecord> {
    const rows = await this.pg.query<LeadScoreRecord>(
      `SELECT *
       FROM lead_scores
       WHERE candidate_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [candidateId]
    );

    if (!rows[0]) {
      throw new NotFoundException(`Candidate ${candidateId} chưa có dữ liệu phân tích`);
    }

    return rows[0];
  }

  private async getCandidateWithContext(candidateId: string): Promise<CandidateWithContext> {
    const rows = await this.pg.query<CandidateWithContext>(
      `SELECT
         c.id,
         c.job_id,
         c.name,
         c.domain,
         c.linkedin_url,
         c.industry,
         c.employee_estimate,
         c.source_confidence,
         c.source_json,
         dj.icp_id,
         icp.name AS icp_name,
         icp.industries AS icp_industries,
         icp.countries AS icp_countries,
         icp.employee_min AS icp_employee_min,
         icp.target_roles AS icp_target_roles,
         icp.pain_keywords AS icp_pain_keywords,
         icp.product_focus AS icp_product_focus
       FROM company_candidates c
       LEFT JOIN discovery_jobs dj ON dj.id = c.job_id
       LEFT JOIN icp_profiles icp ON icp.id = dj.icp_id
       WHERE c.id = $1`,
      [candidateId]
    );

    if (!rows[0]) {
      throw new NotFoundException(`Candidate ${candidateId} không tồn tại`);
    }

    return rows[0];
  }

  private async buildScore(candidate: CandidateWithContext): Promise<{
    score: number;
    breakdown: Record<string, number>;
    explanation: string;
  }> {
    const icpIndustries = Array.isArray(candidate.icp_industries)
      ? (candidate.icp_industries as string[]).map((value) => value.toLowerCase())
      : [];

    const candidateIndustry = candidate.industry?.toLowerCase() ?? '';
    const industryMatch = icpIndustries.some((industry) => candidateIndustry.includes(industry));

    const employeeMin = candidate.icp_employee_min ?? 0;
    const employeeScore =
      candidate.employee_estimate && employeeMin > 0
        ? candidate.employee_estimate >= employeeMin
          ? 20
          : 8
        : 10;

    const sourceConfidenceValue = Number(candidate.source_confidence ?? '0.5');
    const sourceConfidence = Number.isFinite(sourceConfidenceValue)
      ? Math.max(0, Math.min(20, Math.round(sourceConfidenceValue * 20)))
      : 10;

    const digitalSignals =
      (candidate.domain ? 8 : 0) + (candidate.linkedin_url ? 8 : 0) + (candidate.industry ? 4 : 0);

    const industryFit = industryMatch ? 35 : candidate.industry ? 18 : 10;

    const breakdown = {
      industryFit,
      employeeFit: employeeScore,
      sourceConfidence,
      digitalSignals
    };

    const rawScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    const score = Math.max(0, Math.min(100, rawScore));

    const fallbackExplanation = [
      `Candidate "${candidate.name}" có điểm phù hợp ${score}/100 với ICP "${candidate.icp_name ?? 'N/A'}".`,
      `Industry fit: ${industryFit}/35; Employee fit: ${employeeScore}/20; Source confidence: ${sourceConfidence}/20; Digital signals: ${digitalSignals}/25.`,
      industryMatch
        ? 'Ngành của candidate trùng với tập ngành mục tiêu trong ICP.'
        : 'Ngành của candidate chưa trùng rõ với ICP, cần kiểm tra thủ công trước outreach.',
      candidate.employee_estimate && employeeMin > 0
        ? `Quy mô nhân sự ước tính: ${candidate.employee_estimate}, ngưỡng ICP: ${employeeMin}.`
        : 'Thiếu dữ liệu quy mô nhân sự hoặc ICP chưa định nghĩa ngưỡng employee_min.'
    ].join(' ');

    const aiExplanation = await this.openAi.generateLeadAnalysis({
      candidateName: candidate.name,
      icpName: candidate.icp_name ?? 'N/A',
      score,
      breakdown,
      industry: candidate.industry,
      employeeEstimate: candidate.employee_estimate,
      domain: candidate.domain
    });

    return {
      score,
      breakdown,
      explanation: aiExplanation ?? fallbackExplanation
    };
  }
}
