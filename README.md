# BizGo — nền tảng bán hàng trực tiếp (Next.js + NestJS + PostgreSQL)

Bán hàng một chủ thể (BizGo), xưởng đối tác đóng gói/giao. Không phải marketplace nhiều nhà bán.
Quy tắc bắt buộc: [`CLAUDE.md`](CLAUDE.md). Đặc tả: [`docs/BIZGO_MASTER_IMPLEMENTATION_SPEC.md`](docs/BIZGO_MASTER_IMPLEMENTATION_SPEC.md).

## Cấu trúc thư mục

```
web/
  storefront/     Website khách hàng (Next.js, tiếng Việt)
  backoffice/     Admin + Cổng xưởng (Next.js, /admin và /factory)
backend/
  api/            NestJS REST API /v1 (auth, RBAC, catalog...)
  worker/         Xử lý nền (outbox, job)
mobile/           Ứng dụng di động (Phase 6 - chưa làm)
packages/         shared, contracts, db (Prisma + seed + test harness), ui-web
prisma/           schema + migrations PostgreSQL
infra/docker/     Dockerfile + docker-compose
docs/             Đặc tả, ADR, ERD, ma trận quyền, state machine, OpenAPI, báo cáo từng phase
source/           Tài liệu gốc (BRD, kiến trúc, danh mục 82 mặt hàng, prototype HTML) - chỉ để tham chiếu
```

## Chạy trên máy mới (Windows/macOS/Linux)

Yêu cầu: Node.js 22–24. **Không cần cài pnpm riêng** — dùng corepack. `node_modules` không nằm trong git; chạy lệnh cài là có lại.

```bash
corepack pnpm install
corepack pnpm db:generate
corepack pnpm --filter @bizgo/shared build
corepack pnpm --filter @bizgo/db build
```

Cơ sở dữ liệu dev **không cần Docker** (PostgreSQL nhúng, lưu ở `.embedded-pg/`):

```bash
corepack pnpm --filter @bizgo/db dev:db        # migrate + seed 82 sản phẩm NHÁP, giữ chạy
```

API (terminal khác; đặt biến môi trường theo `.env.example`):

```bash
corepack pnpm --filter @bizgo/api build
corepack pnpm owner:bootstrap                  # tạo OWNER đầu tiên (nhập email + mật khẩu lúc chạy)
corepack pnpm --filter @bizgo/api start        # http://localhost:4000
```

Web:

```bash
corepack pnpm --filter @bizgo/storefront-web dev    # http://localhost:3000
corepack pnpm --filter @bizgo/backoffice-web dev    # http://localhost:3001/admin
```

Docker Compose (staging-like): `docker compose -f infra/docker/docker-compose.yml --env-file .env up --build`
(chưa được chạy thử trong môi trường phát triển vì máy không có Docker).

## Kiểm tra chất lượng

```bash
corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck
corepack pnpm test                              # test tích hợp dùng PostgreSQL thật (nhúng sẵn)
corepack pnpm --filter @bizgo/api openapi:check # hợp đồng OpenAPI không lệch so với code
```

## Trạng thái

- Phase 0 (phân tích, ADR, ERD, ma trận quyền, state machine): xong — xem `docs/phase0/`.
- Phase 1 (nền tảng, catalog chỉ đọc, auth/MFA/RBAC, website + admin): xong phần lớn — báo cáo: `docs/phase1/PHASE1_REPORT_VI.md`.
- 82 mặt hàng đều ở trạng thái **NHÁP**; chưa có giá, SKU, tồn kho. Các quyết định kinh doanh còn thiếu: `docs/decisions/DECISION_LOG.md` (D01–D20).
