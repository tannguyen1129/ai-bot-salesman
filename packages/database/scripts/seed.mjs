import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

dotenv.config({ path: path.join(repoRoot, '.env') });

const fallbackDatabaseUrl = `postgresql://${process.env.POSTGRES_USER ?? 'bot_salesman'}:${process.env.POSTGRES_PASSWORD ?? 'bot_salesman_dev'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB ?? 'bot_salesman'}`;
const connectionString = process.env.DATABASE_URL ?? fallbackDatabaseUrl;

const { Client } = pg;
const client = new Client({ connectionString });

async function createIcp({
  name,
  industries,
  countries,
  revenueMin,
  employeeMin,
  targetRoles,
  painKeywords,
  productFocus
}) {
  const rows = await client.query(
    `INSERT INTO icp_profiles (
      name, industries, countries, revenue_min, employee_min,
      target_roles, pain_keywords, product_focus, is_active
    ) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, true)
    RETURNING id`,
    [
      name,
      JSON.stringify(industries),
      JSON.stringify(countries),
      revenueMin,
      employeeMin,
      JSON.stringify(targetRoles),
      JSON.stringify(painKeywords),
      JSON.stringify(productFocus)
    ]
  );

  return rows.rows[0].id;
}

async function createJob({ icpId, source, status, totalFound, startedAt, finishedAt, errorMessage }) {
  const rows = await client.query(
    `INSERT INTO discovery_jobs (
      icp_id, source, status, total_found, total_scored, started_at, finished_at, error_message
    ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
    RETURNING id`,
    [icpId, source, status, totalFound, startedAt ?? null, finishedAt ?? null, errorMessage ?? null]
  );

  return rows.rows[0].id;
}

async function createCandidate({ jobId, name, domain, linkedinUrl, industry, employeeEstimate, status }) {
  await client.query(
    `INSERT INTO company_candidates (
      job_id, name, domain, linkedin_url, industry, employee_estimate,
      status, source_confidence, source_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0.85, $8::jsonb)`,
    [
      jobId,
      name,
      domain,
      linkedinUrl,
      industry,
      employeeEstimate,
      status,
      JSON.stringify({ seeded: true, source: 'seed-demo' })
    ]
  );
}

async function seed() {
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM company_candidates
       WHERE job_id IN (SELECT id FROM discovery_jobs WHERE source = 'seed-demo')`
    );
    await client.query(`DELETE FROM discovery_jobs WHERE source = 'seed-demo'`);
    await client.query(`DELETE FROM icp_profiles WHERE name LIKE 'DEMO - %'`);

    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

    const icpA = await createIcp({
      name: 'DEMO - Enterprise Security Vietnam',
      industries: ['Cybersecurity', 'Cloud Security'],
      countries: ['VN'],
      revenueMin: 1200000,
      employeeMin: 200,
      targetRoles: ['CTO', 'CISO'],
      painKeywords: ['DDoS', 'WAF', 'Uptime'],
      productFocus: ['Cloud WAF', 'Anti DDoS']
    });

    const icpB = await createIcp({
      name: 'DEMO - Fintech Platform SEA',
      industries: ['Fintech', 'Payments'],
      countries: ['VN', 'SG'],
      revenueMin: 3000000,
      employeeMin: 350,
      targetRoles: ['Head of Infrastructure', 'VP Engineering'],
      painKeywords: ['Fraud', 'Scalability', 'Compliance'],
      productFocus: ['DDoS Protection', 'API Security']
    });

    const icpC = await createIcp({
      name: 'DEMO - E-commerce High Traffic',
      industries: ['E-commerce', 'Retail Tech'],
      countries: ['VN', 'TH'],
      revenueMin: 5000000,
      employeeMin: 500,
      targetRoles: ['CTO', 'Director of Platform'],
      painKeywords: ['Peak traffic', 'Bot abuse', 'Latency'],
      productFocus: ['CDN', 'Bot Protection']
    });

    const jobA1 = await createJob({
      icpId: icpA,
      source: 'seed-demo',
      status: 'completed',
      totalFound: 6,
      startedAt: tenMinutesAgo,
      finishedAt: fiveMinutesAgo
    });

    const jobA2 = await createJob({
      icpId: icpA,
      source: 'seed-demo',
      status: 'running',
      totalFound: 2,
      startedAt: twoMinutesAgo
    });

    const jobB1 = await createJob({
      icpId: icpB,
      source: 'seed-demo',
      status: 'queued',
      totalFound: 0
    });

    const jobC1 = await createJob({
      icpId: icpC,
      source: 'seed-demo',
      status: 'failed',
      totalFound: 0,
      startedAt: tenMinutesAgo,
      finishedAt: fiveMinutesAgo,
      errorMessage: 'RapidAPI timeout (demo)'
    });

    await createCandidate({
      jobId: jobA1,
      name: 'VN Secure Telecom',
      domain: 'vnsecure.example.com',
      linkedinUrl: 'https://linkedin.com/company/vn-secure-telecom',
      industry: 'Telecom',
      employeeEstimate: 420,
      status: 'new'
    });

    await createCandidate({
      jobId: jobA1,
      name: 'Saigon Digital Bank',
      domain: 'saigondigitalbank.example.com',
      linkedinUrl: 'https://linkedin.com/company/saigon-digital-bank',
      industry: 'Banking',
      employeeEstimate: 850,
      status: 'ready'
    });

    await createCandidate({
      jobId: jobA2,
      name: 'Cloud Retail VN',
      domain: 'cloudretail.example.com',
      linkedinUrl: 'https://linkedin.com/company/cloud-retail-vn',
      industry: 'Retail',
      employeeEstimate: 380,
      status: 'enriching'
    });

    await createCandidate({
      jobId: jobB1,
      name: 'FastPay SEA',
      domain: 'fastpaysea.example.com',
      linkedinUrl: 'https://linkedin.com/company/fastpay-sea',
      industry: 'Fintech',
      employeeEstimate: 300,
      status: 'new'
    });

    await createCandidate({
      jobId: jobC1,
      name: 'Mega Shop Platform',
      domain: 'megashop.example.com',
      linkedinUrl: 'https://linkedin.com/company/mega-shop-platform',
      industry: 'E-commerce',
      employeeEstimate: 1200,
      status: 'disqualified'
    });

    await client.query('COMMIT');
    console.log('Seed demo hoàn tất. Đã tạo ICP/Jobs/Candidates mẫu.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed thất bại:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
