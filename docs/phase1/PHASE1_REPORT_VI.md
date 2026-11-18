# Báo cáo Phase 1 — Nền tảng, catalog chỉ đọc, auth/RBAC, website + admin

Ngày: 18/11/2026. Ngôn ngữ báo cáo: tiếng Việt; code/kỹ thuật: tiếng Anh (theo yêu cầu).

## 1. Kết luận ngắn

Phase 1 hoàn thành **phần lớn** (~90%). Hệ thống chạy thật: PostgreSQL → NestJS API → 2 website Next.js, **không có dữ liệu giả, không có OTP cố định, không có localStorage**.
**Chưa chạy được ở máy này:** Docker Compose (máy không có Docker) và Playwright E2E tự động — xem mục 7.

## 2. Đã làm được

| Hạng mục (IMPLEMENTATION_TODO) | Trạng thái |
|---|---|
| Monorepo pnpm: `web/`, `backend/`, `mobile/`(để trống), `packages/`, `prisma/`, `infra/` | ✅ |
| Prisma migration M001 + seed 8 nhóm + **82 sản phẩm NHÁP** từ CSV | ✅ test trên PostgreSQL thật |
| Auth: đăng ký, OTP (ngẫu nhiên, TTL 5', tối đa 5 lần, cooldown 60'), đăng nhập, refresh xoay vòng + phát hiện dùng lại, đăng xuất, đổi/quên/đặt lại mật khẩu | ✅ |
| MFA TOTP bắt buộc cho OWNER/ACCOUNTANT + mã khôi phục dùng 1 lần | ✅ (đã thử tay trên trình duyệt) |
| RBAC + tách realm (CUSTOMER/ADMIN/FACTORY) + ma trận quyền sinh tự động | ✅ |
| Audit log (chỉ ghi thêm, DB chặn sửa/xóa), outbox, idempotency key, rate-limit | ✅ |
| API công khai: `GET /v1/categories`, `/products`, `/products/:slug` (chỉ hàng ACTIVE — hiện rỗng vì cả 82 là NHÁP) | ✅ |
| API admin: danh mục/sản phẩm (xem cả NHÁP), audit, staff | ✅ |
| OpenAPI sinh từ code (`docs/api/openapi.json`, kiểm tra lệch trong CI) | ✅ |
| Website khách: trang chủ, danh mục (lọc/tìm/sắp xếp/phân trang theo URL), chi tiết SP, đăng nhập, đăng ký + OTP | ✅ giữ phong cách xanh/cam của prototype |
| Backoffice: đăng nhập admin + MFA, tổng quan, danh sách 82 SP, chi tiết SP; cổng xưởng chỉ đăng nhập | ✅ |
| Worker: outbox publisher (SKIP LOCKED, backoff, DEAD, consumer idempotent) | ✅ |
| Dev DB không cần Docker (`dev:db`), CLI tạo OWNER đầu tiên (không có mật khẩu mặc định) | ✅ |
| Docker Compose + Dockerfile + CI (GitHub Actions) + `.env.example` | ⚠️ đã viết, **chưa chạy thử** |

## 3. Migration

`prisma/migrations/20261118000000_m001_foundation`: bảng identity/session/OTP/MFA/RBAC, catalog (categories, products, media, aliases), audit, outbox, idempotency, settings; trigger bất biến cột `source_*` của sản phẩm, audit chỉ-ghi-thêm, CHECK slug/OTP, index trigram + outbox. Chạy từ DB rỗng thành công; seed chạy 2 lần cho kết quả giống nhau.

## 4. Lệnh và kết quả test (chạy thật, 18/11/2026)

| Gói | Tests |
|---|---|
| `@bizgo/shared` (tiền, đơn vị, quyền, text) | 34 passed |
| `@bizgo/db` (migration + seed trên PostgreSQL 17) | 18 passed |
| `@bizgo/api` (7 file: nền tảng, catalog, auth/OTP, RBAC/MFA, infra, hợp đồng) | 90 passed |
| `@bizgo/worker` (outbox, chạy lặp 4 lần ổn định) | 6 passed |
| `@bizgo/contracts` | 5 passed |
| `web/storefront` (tiện ích URL) | 4 passed |
| **Tổng** | **157 passed, 0 failed** |

Ngoài ra: `lint` sạch, `format:check` sạch, `typecheck` sạch, `openapi:check` khớp, `next build` thành công cho cả 2 website.
Test tích hợp dùng **PostgreSQL thật** (bản nhúng qua npm), không dùng SQLite/mock.

## 5. Kiểm tra responsive (trình duyệt tích hợp)

Không tràn ngang tại 320, 375, 390, 430, 768, 1024 px (`scrollWidth ≤ innerWidth`) trên `/`, `/danh-muc`, `/dang-ky`. **Chưa đo** 1280/1440/1920 và 200% zoom; **chưa chạy axe/Playwright** (chưa cài).

## 6. Chỗ khác với tài liệu / rủi ro

1. **Bản sửa nhầm file gốc:** lệnh `prettier --write` đã định dạng lại `CLAUDE.md`, 2 README gốc và `docs/BIZGO_MASTER_IMPLEMENTATION_SPEC.md` (không có git để so sánh). Đã khôi phục: `CLAUDE.md`, `README_START_HERE.md`, `README_VI_HUONG_DAN.md` **đúng từng byte** như bản gốc; `BIZGO_MASTER_IMPLEMENTATION_SPEC.md` khôi phục về đúng số dòng (341) và cấu trúc, nhưng **không thể chứng minh trùng từng byte**. Nội dung không đổi. Đã thêm `docs/` và các file gốc vào `.prettierignore`. Bạn nên so với bản zip gốc nếu cần chắc chắn.
2. Màu chữ phụ `--muted` làm đậm hơn prototype (#718077 → #5f6f66) để đạt tương phản 4.5:1; cỡ chữ mobile tăng từ 9–11px lên ≥12–14px.
3. Phiên bản chọn: Node 22–24, NestJS 11, Prisma 6.19, Next 15.5, TypeScript 5.9, PostgreSQL 17 (có bản mới hơn như NestJS 12/Prisma 7/Next 16 — nâng cấp sau, ghi ở ADR-0001).
4. `packages/contracts` viết tay (chưa sinh từ OpenAPI vì response chưa gắn schema) — làm ở Phase 2.
5. Danh mục (8 nhóm) seed trạng thái **ACTIVE** để menu hiển thị; sản phẩm vẫn NHÁP. Ghi ở ADR-0009.
6. Bản `openapi.skeleton.yaml` (143 endpoint của toàn dự án) viết tay, **chưa kiểm tra bằng máy**; `openapi.json` sinh từ code mới là bản chuẩn cho phần đã làm.
7. Chưa có nhà cung cấp gửi OTP/email/SMS (D15): production sẽ trả `503 OTP_DELIVERY_NOT_CONFIGURED` (fail-closed), chỉ dev mới in mã ra log khi bật `DEV_OTP_CONSOLE=true`.
8. Chưa làm: trang tài khoản/đơn hàng/giỏ (Phase 2), tạo nhân viên qua giao diện, sinh client từ OpenAPI, `Redis` thực tế (adapter đã viết nhưng chưa test vì không có Redis).

## 7. Việc chưa chạy / chưa kiểm chứng

- `docker compose ... up` — **NOT RUN** (không có Docker).
- Redis rate-limiter — **NOT RUN** (chỉ test bản in-memory).
- Playwright E2E, axe, Lighthouse — **NOT RUN**.
- Dashboard/danh sách admin được thử tay trên Chrome tích hợp (đăng nhập → MFA → 82 sản phẩm), nhưng chưa có test E2E tự động.

## 8. Quyết định kinh doanh đang chặn (không bịa)

D01–D20 trong `docs/decisions/DECISION_LOG.md`. Với Phase 2 cần sớm: **D02** (SKU/quy cách thực), **D04** (giá), **D05** (phí/vùng giao), **D14** (VAT), **D17** (đơn tối thiểu), **D15** (kênh gửi OTP).

## 9. Phase kế tiếp

Phase 2: SKU/variant + cổng kích hoạt SKU, bảng giá, kho + sổ cái, `checkout/quote`, giỏ hàng, đơn hàng idempotent có giữ tồn thật, kiểm thử tranh chấp tồn kho. Chỉ chạy được với dữ liệu **TEST** cho đến khi chủ sở hữu trả lời D02/D04/D05/D14.
