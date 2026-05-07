# AI Bot Salesman (VNETWORK) - P1 Approved Flow

Monorepo MVP theo tai lieu P1:
- `apps/web`: Dashboard van hanh P1 (search jobs + prospects)
- `apps/api`: NestJS API + worker queue discovery
- `packages/database`: SQL migrations PostgreSQL
- `packages/shared`: DTO/Zod schema dung chung
- `packages/integrations`: wrappers RapidAPI, Hunter, OpenAI
- `packages/workflow`: queue names + event types
- `infra`: Docker Compose local

## Run nhanh local

1. Cai Node.js 22+ (da kem `npm`)
2. Tao file env:

```bash
cp .env.example .env
```

3. Cai dependencies:

```bash
npm install
```

4. Chay db/redis/minio:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis minio
```

5. Chay migration:

```bash
npm run migrate --workspace=@vnetwork/database
```

6. Chay app:

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
```

Neu API khong chay o `:4000`, cap nhat `NEXT_PUBLIC_API_BASE_URL` trong `.env`.

## Luong P1 hien tai

1. Tao search job theo ten cong ty: `POST /p1/search-jobs`
2. Worker chay theo flow: company name -> company profile -> key person
3. Duyet prospects: `GET /p1/prospects` + `PATCH /p1/prospects/:id/status`
