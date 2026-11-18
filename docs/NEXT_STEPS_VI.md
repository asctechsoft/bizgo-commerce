# Làm tiếp từ đâu (cập nhật 19/11/2026)

## Đang ở đâu
- **Phase 0**: xong. **Phase 1**: xong ~90% (báo cáo: `docs/phase1/PHASE1_REPORT_VI.md`).
- **Phase 2**: backend xong + test; **giao diện web chưa làm** (`docs/phase2/PHASE2_PROGRESS_VI.md`).
- Code đã push lên GitHub nhánh `main` (commit mới nhất: "feat(phase2): commerce core backend…"). Không có việc dở chưa commit.
- Repo GitHub đã đổi địa chỉ: `https://github.com/asctechsoft/bizgo-commerce.git` (địa chỉ cũ vẫn push được nhờ chuyển hướng).

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

## Việc tiếp theo (theo thứ tự)
1. **Web khách (Phase 2)**: chọn quy cách ở `/san-pham/[slug]` + thêm vào giỏ → `/gio-hang` → `/thanh-toan` (chọn địa chỉ, gọi `checkout/quote`, gửi `POST /orders` kèm `Idempotency-Key` tạo 1 lần/lần thử, xử lý `PRICE_CHANGED`, chỉ báo thành công khi API trả 201) → `/dat-hang-thanh-cong` → `/tai-khoan/don-hang` (+ chi tiết, hủy) và `/tai-khoan/dia-chi`. Cần mở rộng `packages/contracts` (cart, quote, orders, addresses) và thêm text vào `messages/vi.json`.
2. **Admin (Phase 2)**: màn hình đơn hàng (danh sách, chi tiết, xác nhận/giữ/hủy), biến thể SKU + kiểm tra điều kiện mở bán, giá/giá vốn, kho + điều chỉnh tồn. API đã có sẵn (`/v1/admin/...`, xem `docs/api/openapi.json`).
3. Playwright E2E + kiểm tra responsive 9 độ rộng + axe (chưa chạy lần nào).
4. Giỏ khách vãng lai + tra cứu đơn có xác minh (cần chủ sở hữu trả lời **D15, D16**); worker hết hạn giữ tồn (cần **D06**).
5. Sau đó Phase 3 (xưởng: nhận phiếu, soạn, đóng gói, bàn giao) — xem `docs/phase0/04_REFINED_TASKS.md`.

## Còn chặn bởi quyết định kinh doanh (không tự bịa)
D02 (quy cách SKU thật), D04 (giá), D05 (phí/vùng giao), D14 (VAT), D17 (đơn tối thiểu), D15 (kênh gửi OTP), D16 (mua vãng lai), D06 (chuyển khoản/COD). Danh sách đầy đủ: `docs/decisions/DECISION_LOG.md`.

## Lưu ý khi làm tiếp
- Dùng `corepack pnpm …` (máy không có pnpm toàn cục). Máy này không có Docker/Redis.
- Đừng chạy `prettier` lên `docs/` hoặc file gốc (đã có trong `.prettierignore`) — từng làm đổi định dạng file gốc, đã khôi phục.
- Dữ liệu test dùng SKU bắt đầu `TEST-`; các setting mở checkout (`flags.cod_enabled`, `delivery.allowed_provinces`, `checkout.shipping_policy`, `checkout.tax_policy`) mặc định đều **chặn**.
- DB dev nhúng nằm ở `.embedded-pg/` (không nằm trong git); xóa thư mục này để làm lại từ đầu.
- Khi sửa API: chạy `corepack pnpm --filter @bizgo/api openapi:export` để cập nhật `docs/api/openapi.json` (CI kiểm tra lệch).
