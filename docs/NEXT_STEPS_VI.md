# Làm tiếp từ đâu (cập nhật 19/11/2026)

## Đang ở đâu
- **Phase 0**: xong. **Phase 1**: xong ~90% (báo cáo: `docs/phase1/PHASE1_REPORT_VI.md`).
- **Phase 2**: backend xong + test; **giao diện web chưa làm** (`docs/phase2/PHASE2_PROGRESS_VI.md`).
- Code đã push lên GitHub nhánh `main` (commit mới nhất: "feat(phase2): commerce core backend…"). Không có việc dở chưa commit.
- Repo GitHub đã đổi địa chỉ: `https://github.com/asctechsoft/bizgo-commerce.git` (địa chỉ cũ vẫn push được nhờ chuyển hướng).

## Luồng đơn hàng đầy đủ + realtime (19/11/2026)
- Admin: xác nhận → soạn → sẵn sàng → bàn giao (nhập đơn vị VC + mã vận đơn) → đã giao → hoàn tất; ghi nhận thu COD riêng; đặt phí ship; duyệt/từ chối yêu cầu hủy; hộp thư hỗ trợ `/admin/support`.
- Khách: danh sách đơn có tab/đếm/sắp xếp/mua lại, chi tiết theo trạng thái (stepper, vận chuyển, hủy có lý do), trang hỗ trợ `/tai-khoan/don-hang/[id]/ho-tro`. Trạng thái đổi **realtime** (SSE, ADR-0015).
- Chưa có: đánh giá, hóa đơn, mã giảm giá, yêu thích, upload ảnh minh chứng, bản đồ/shipper, hoàn tiền online.

## Chạy cả hệ thống bằng 1 lệnh (khuyên dùng)
```bash
node scripts/dev-stack.mjs build   # build API + 2 web (lần đầu hoặc sau khi sửa code)
node scripts/dev-stack.mjs start   # DB nhúng + fixtures TEST + OWNER dev + API + web (Ctrl+C để dừng)
```
Sau đó: web khách http://localhost:3000, quản trị http://localhost:3001/admin/login, API http://localhost:4000 (mã OTP in ở log `[api]`).
OWNER dev: `owner@bizgo.local` / `Bz-Dev-Only-Pass-98765` (chỉ dùng máy dev; lần đăng nhập đầu phải đăng ký TOTP). Địa chỉ giao thử: tỉnh `Hà Nội` hoặc `Hồ Chí Minh`.

## Chạy lại trên máy (không cần Docker)
```bash
corepack pnpm install
corepack pnpm db:generate
corepack pnpm --filter @bizgo/shared build
corepack pnpm --filter @bizgo/db build
corepack pnpm test                       # ~200 test, dùng PostgreSQL nhúng thật (mất 1–2 phút)
```
Chạy cả hệ thống để xem bằng mắt (3 cửa sổ terminal):
1. `corepack pnpm --filter @bizgo/db dev:db` → DB + seed 82 sản phẩm NHÁP (giữ chạy).
2. API: đặt biến môi trường theo `.env.example` (`DATABASE_URL` in ra ở bước 1, `DEV_OTP_CONSOLE=true`), rồi `corepack pnpm --filter @bizgo/api build` và `corepack pnpm --filter @bizgo/api start`.
3. Web: `corepack pnpm --filter @bizgo/storefront-web dev` (cổng 3000) và `corepack pnpm --filter @bizgo/backoffice-web dev` (cổng 3001).
Tạo OWNER đầu tiên: `corepack pnpm owner:bootstrap` (nhập email + mật khẩu lúc chạy; đăng nhập `/admin/login` rồi đăng ký TOTP).

## Mới thêm (chưa dùng ở web)
- `packages/contracts` đã có sẵn client cho giỏ hàng, báo giá, đặt hàng (`placeOrder` nhận `Idempotency-Key`), đơn của tôi, địa chỉ.
- `corepack pnpm --filter @bizgo/db dev:fixtures` nạp 3 SKU **TEST** (giá/tồn tùy ý) và mở checkout cho Hà Nội/Hồ Chí Minh (COD, phí ship báo sau) để bấm thử shop. Chạy sau `dev:db`. Bị từ chối khi `APP_ENV=production`.

## Đã làm thêm (19/11/2026, phiên 2)
- **Web khách**: chọn quy cách + thêm giỏ ở `/san-pham/[slug]`, `/gio-hang`, `/thanh-toan` (chọn/thêm địa chỉ, báo giá từ API, `Idempotency-Key` tạo một lần/lần thử, xử lý `PRICE_CHANGED`/`QUOTE_EXPIRED`, chỉ báo thành công khi API trả 201), `/dat-hang-thanh-cong`, `/tai-khoan/don-hang` (+ chi tiết, hủy), `/tai-khoan/dia-chi`. Đăng nhập hỗ trợ `?next=` (chỉ đường dẫn nội bộ).
- **Admin**: `/admin/orders` (+ chi tiết: xác nhận/giữ/tiếp tục/hủy, ẩn PII/lãi nếu thiếu quyền), `/admin/inventory` (xem tồn, tạo kho, điều chỉnh tồn), panel SKU trên trang sản phẩm (tạo SKU nháp, kiểm tra điều kiện mở bán, đặt giá/giá vốn, mở bán; thao tác cần MFA mới sẽ hiện ô nhập mã).
- Đã chạy thật: DB nhúng + API + web; đăng ký → đăng nhập → giỏ → báo giá → đặt đơn COD (replay cùng key trả cùng đơn) → hủy; và đặt đơn qua giao diện trình duyệt. **Chưa** có Playwright E2E tự động, chưa kiểm tra 9 độ rộng + axe, chưa bấm thử các màn admin bằng trình duyệt (chỉ typecheck/lint/build).
- Máy này: corepack lỗi chữ ký → dùng `pnpm --config.manage-package-manager-versions=false …` (pnpm 10 toàn cục), Node 20 (dự án yêu cầu ≥22, vẫn chạy được). pnpm 10 bỏ qua script build → chạy `npx prisma generate --schema prisma/schema.prisma` rồi build `@bizgo/db`.
- Khi thử bằng curl trên Windows, tiếng Việt bị hỏng mã hóa → dùng Node `fetch` hoặc giao diện.

## Việc tiếp theo (theo thứ tự)
1. Playwright E2E (đăng nhập → đặt hàng → admin xác nhận), responsive 320–1920, axe.
2. Admin: sửa/lọc nâng cao; chọn biến thể theo SKU ở form điều chỉnh tồn (hiện nhập UUID biến thể). Đã bấm thử: đăng nhập OWNER + MFA, danh sách/xác nhận đơn, kho.
3. Giỏ khách vãng lai + tra cứu đơn có xác minh (cần chủ sở hữu trả lời **D15, D16**); worker hết hạn giữ tồn (cần **D06**).
4. Sau đó Phase 3 (xưởng: nhận phiếu, soạn, đóng gói, bàn giao) — xem `docs/phase0/04_REFINED_TASKS.md`.

## Còn chặn bởi quyết định kinh doanh (không tự bịa)
D02 (quy cách SKU thật), D04 (giá), D05 (phí/vùng giao), D14 (VAT), D17 (đơn tối thiểu), D15 (kênh gửi OTP), D16 (mua vãng lai), D06 (chuyển khoản/COD). Danh sách đầy đủ: `docs/decisions/DECISION_LOG.md`.

## Lưu ý khi làm tiếp
- Dùng `corepack pnpm …` (máy không có pnpm toàn cục). Máy này không có Docker/Redis.
- Đừng chạy `prettier` lên `docs/` hoặc file gốc (đã có trong `.prettierignore`) — từng làm đổi định dạng file gốc, đã khôi phục.
- Dữ liệu test dùng SKU bắt đầu `TEST-`; các setting mở checkout (`flags.cod_enabled`, `delivery.allowed_provinces`, `checkout.shipping_policy`, `checkout.tax_policy`) mặc định đều **chặn**.
- DB dev nhúng nằm ở `.embedded-pg/` (không nằm trong git); xóa thư mục này để làm lại từ đầu.
- Khi sửa API: chạy `corepack pnpm --filter @bizgo/api openapi:export` để cập nhật `docs/api/openapi.json` (CI kiểm tra lệch).
