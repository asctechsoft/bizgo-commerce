# HƯỚNG DẪN TRIỂN KHAI BIZGO VỚI CLAUDE CODE

## 1. Bản bàn giao gồm những gì?
- `CLAUDE.md`: quy tắc bắt buộc cho Claude Code, nên đặt ở thư mục gốc repository BizGo.
- `docs/BIZGO_MASTER_IMPLEMENTATION_SPEC.md`: đặc tả chi tiết full-stack gồm kiến trúc, nghiệp vụ, cơ sở dữ liệu, API, frontend responsive, backend orders/kho/xưởng/thanh toán, bảo mật, kiểm thử, triển khai.
- `docs/IMPLEMENTATION_TODO.md`: checklist code theo giai đoạn và tiêu chí hoàn thành.
- `docs/ui_route_api_matrix.csv`: mỗi màn trong HTML prototype ánh xạ sang route Next.js, endpoint API, quyền và kết quả cần đạt.
- `docs/catalog_source_82.csv`: 82 mặt hàng nguyên gốc thuộc 8 nhóm; mặc định tất cả là bản nháp, chưa được bán.
- `docs/decisions/DECISION_LOG.md`: theo dõi thông tin còn thiếu cần duyệt trước khi bán thật.
- `source/`: bản gốc BRD, bản kiến trúc, file MD danh mục và ZIP prototype HTML kèm ảnh assets.

## 2. Cách bắt đầu trên máy
1. Tải ZIP và giải nén thư mục `BizGo_Claude_Handoff`.
2. Mở thư mục này trong VS Code/Claude Code. Chưa cần thay HTML bằng code Next.js ngay.
3. Cho Claude đọc `CLAUDE.md`, file Master Spec và toàn bộ `source`.
4. Bắt Claude thực hiện **Phase 0** trước: phân tích thiếu sót, chốt sơ đồ database ERD, OpenAPI, RBAC, state machine, đặc tả domain và backlog có thứ tự. Lưu sản phẩm đầu ra vào `docs/`.
5. Sau khi xem Phase 0, yêu cầu Claude chạy Phase 1 khởi tạo monorepo + database + backend catalog + website responsive. Từng phase phải chạy được và có test.
6. Dùng `docs/IMPLEMENTATION_TODO.md` để đánh dấu các hạng mục thật sự đã hoàn thiện.

## 3. Prompt đầu tiên nên dán vào Claude Code
> Hãy đọc toàn bộ `CLAUDE.md`, `docs/BIZGO_MASTER_IMPLEMENTATION_SPEC.md`, cả hai file DOCX BRD/kiến trúc, danh sách nguyên liệu và prototype HTML trong `source`. Đây là dự án BizGo bán hàng trực tiếp, không phải marketplace đa nhà bán. HTML hiện tại chỉ là UI demo; cần giữ phong cách và responsive nhưng viết lại bằng Next.js và kết nối NestJS API thực. Trước tiên thực hiện Phase 0: phân tích khoảng cách tài liệu, tạo ERD/schema plan, OpenAPI, permission matrix, state machines, ADR, backlog theo dependency, danh sách quyết định còn thiếu. Tuyệt đối không tự bịa giá, cân nặng mỗi bao, tồn kho, pháp nhân hoặc phí giao. Chưa triển khai toàn bộ hệ thống trong một lượt. Báo cáo đầy đủ để tao duyệt trước khi bắt đầu Phase 1.

## 4. Luồng vận hành phải ưu tiên
`Khách tìm hàng → chọn SKU đủ điều kiện → lấy giá từ server → kiểm tra địa chỉ/vùng giao → giữ tồn an toàn → tạo đơn không trùng → BizGo xác nhận → xưởng nhận phiếu riêng → chọn lô / đóng gói → vận chuyển → giao nhận → đối soát COD và tiền xưởng → tính lãi thật`.

Khi khách sỉ đăng ký, sale/owner phải duyệt trước khi được xem giá theo cấp. Nếu thiếu hàng, xưởng báo ngoại lệ, BizGo phải xin khách lựa chọn chờ, thay SKU, tách giao hoặc hủy/hoàn; không được tự đổi sản phẩm.

## 5. Những chỗ prototype HTML cần thay
- Auth demo/OTP `123456` → xác thực backend thật có giới hạn lượt, hạn OTP, session.
- Giỏ và đơn hàng lưu localStorage → dữ liệu trên backend; giỏ khách vãng lai có session riêng.
- Giá và số tồn demo → pricing/inventory service, chỉ sản phẩm ACTIVE được bán.
- Nút Đặt hàng demo → server quote, idempotency key, transaction giữ tồn.
- Form báo giá/đổi trả/liên hệ demo → API có lưu DB và thông báo theo trạng thái.
- B2B demo → tổ chức/cấp giá đã duyệt, kiểm quyền theo organization.
- Admin và xưởng → có màn và API riêng, xưởng không được thấy lãi hay giá vốn BizGo.

## 6. Quyết định kinh doanh cần điền trước khi lên production
Pháp nhân bán và thu tiền; danh sách 15–30 SKU mở bán đầu; quy cách và giá vốn/giá bán; tồn thật/kho/xưởng; chính sách giao lạnh/khô và hãng vận chuyển; chính sách đổi trả; cấp đại lý/MOQ/công nợ; chính sách riêng tư và hồ sơ chất lượng. Khi chưa có, Claude chỉ code theo dữ liệu DRAFT hoặc test fixture, không kích hoạt bán thật.

## 7. Ranh giới phiên bản
Đặc tả kỹ thuật là **đề xuất triển khai** được xây từ hai tài liệu BizGo đã cung cấp, không thay thế quyết định của chủ sở hữu hay kiểm tra pháp lý. File CSV gồm 82 tên hàng để seed, không phải bảng báo giá SKU. Các ảnh AI chỉ minh họa, phải được đối chiếu hàng và bao bì thực tế khi đưa vào kinh doanh.
