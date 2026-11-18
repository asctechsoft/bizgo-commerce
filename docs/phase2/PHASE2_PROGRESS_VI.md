# Phase 2 — Tiến độ (tạm dừng, chưa hoàn thành)

Ngày: 19/11/2026. **Backend Phase 2 xong và đã kiểm thử; phần giao diện web của Phase 2 chưa làm.**

## Đã xong (đã test trên PostgreSQL thật)
- Migration M002: biến thể SKU, bảng giá (chống chồng khoảng hiệu lực), giá vốn, kho, tồn kho + sổ cái chỉ-ghi-thêm, giỏ hàng, báo giá, đơn hàng, thanh toán, giữ tồn; CHECK tồn không âm/không giữ quá mức; trigger chặn sửa snapshot dòng đơn.
- Bộ máy báo giá thuần: không bịa giá/phí ship/thuế — thiếu thì chặn (`PRICE_NOT_SET`, `SHIPPING_FEE_UNDETERMINED`, `TAX_POLICY_UNDETERMINED`, `DELIVERY_UNSUPPORTED`...), tổng tiền là `null` chứ không phải 0.
- Cổng kích hoạt SKU: sản phẩm thật (ảnh AI, nguồn chưa xác minh) **không thể** mở bán dù có giá/vốn/tồn.
- Đặt hàng idempotent: giữ tồn bằng một câu UPDATE có điều kiện; COD không bao giờ "đã thanh toán" lúc tạo; outbox + audit cùng transaction.
- Hủy đơn nhả tồn đúng một lần; bảng chuyển trạng thái đơn có test theo bảng.
- API: giỏ hàng, báo giá, đơn của tôi (xem/hủy), admin (biến thể, giá, giá vốn, kho, điều chỉnh tồn, đơn: xác nhận/giữ/tiếp tục/hủy). Khách chỉ thấy đơn của mình (404 khi truy cập đơn người khác); admin không thấy giá vốn/lãi nếu thiếu quyền.
- Test UAT đã có: UAT-01 (hết hàng/tranh chấp tồn), UAT-02 (đổi giá), UAT-03 (bấm đúp), UAT-05 (khách A/B), UAT-07 (hàng lạnh), UAT-08 (hủy nhả tồn một lần), UAT-12 (snapshot).
- Tổng test hiện tại: 202 (shared 40, db 18, api 129, worker 6, contracts 5, storefront 4), lint/format/typecheck sạch, OpenAPI không lệch (50 đường dẫn).

## Chưa làm
- Màn hình web: chọn quy cách ở trang sản phẩm, giỏ hàng, thanh toán, đặt hàng thành công, danh sách/chi tiết đơn của khách, địa chỉ; admin: SKU/giá/tồn/đơn.
- Giỏ khách vãng lai + tra cứu đơn có xác minh (chờ D15/D16); worker hết hạn giữ tồn (chỉ cần khi có chuyển khoản, D06).
- E2E trên trình duyệt (Playwright) — chưa chạy.

## Lưu ý
- Toàn bộ số liệu giá/vốn/tồn trong test là **dữ liệu TEST** (SKU bắt đầu `TEST-`), không có trong seed thật.
- Checkout chỉ mở được khi chủ sở hữu cấu hình các setting (COD, vùng giao, chính sách ship/thuế) — mặc định đều chặn.
