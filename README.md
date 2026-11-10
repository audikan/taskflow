# TaskFlow – Quản lý task miễn phí cho nhóm 2–5 người

## Chức năng
- Thêm, sửa, xóa task chính và task nhỏ; danh mục, trạng thái, độ ưu tiên.
- Người thực hiện, người nhận thông tin, đầu mối liên quan, tên và đường link tài liệu.
- Ngày bắt đầu, deadline; lịch xem ngày / tuần / tháng.
- Tìm kiếm / lọc / sắp xếp / thống kê; xuất và nhập JSON.
- **Chế độ nhóm**: đăng nhập email riêng, dữ liệu chung trên Supabase, tự động nhận cập nhật, quyền thao tác ngang nhau. Tối đa 5 thành viên / nhóm.
- **Chế độ dùng thử**: nếu chưa cấu hình, dữ liệu lưu ở localStorage trên đúng máy đang mở.

## Thiết lập miễn phí
1. Tạo tài khoản và project tại https://supabase.com/ (Free plan; hạn mức có thể thay đổi).
2. Mở **SQL Editor** trên Supabase, dán toàn bộ `schema.sql`, bấm **Run**. Chạy trên project trống hoặc kiểm tra trùng tên trước.
3. Mở **Project Settings → API** (hoặc **Connect → API Keys**), lấy **Project URL** và **anon/public publishable key**; dán vào `config.js`. Tuyệt đối không dán `service_role` / `secret` key vào web.
4. Trong **Authentication → Providers → Email**, bật email đăng nhập (OTP / magic link). Email có thể bị giới hạn số lượng gửi trong Free plan.
5. Đưa 4 file `index.html`, `app.js`, `config.js`, `schema.sql` (và README này nếu muốn) lên repo GitHub. Vào **Settings → Pages → Deploy from a branch → main → / (root)**. Trang sẽ có địa chỉ `https://TEN-USER.github.io/TEN-REPO/`.
6. Trong Supabase **Authentication → URL Configuration**, đặt **Site URL** là URL GitHub Pages và thêm URL đó vào **Redirect URLs** (bao gồm dấu `/` cuối nếu website có).
7. Mở web: mỗi người đăng nhập email cá nhân. Một người bấm **Tạo nhóm**, bấm **Sao chép mã mời** và gửi mã riêng cho các thành viên. Người khác đăng nhập rồi nhập mã mời để tham gia. Quyền giống nhau.

### Những điều cần biết
- Github Pages **không phải nơi lưu dữ liệu**. Dữ liệu nhóm nằm trong Supabase Postgres; tài liệu chỉ lưu **link**, không lưu nội dung tệp.
- **Không để mã mời công khai**. Người có mã và tài khoản đăng nhập có thể tham gia nhóm (cho đến khi đủ 5 người). Mã mời mới chỉ hiển thị khi tạo nhóm; hãy cất giữ cẩn thận.
- Các thông tin trong task có thể được mọi người trong cùng nhóm xem/sửa/xóa.
- Khi bật Supabase, localStorage cũ **không tự chuyển** sang nhóm: hãy xuất JSON ở chế độ cá nhân trước, sau đó đăng nhập nhóm và nhập JSON.
- Khi một người đang mở form sửa và người khác sửa cùng task, lần lưu sau sẽ ghi đè nội dung task đó (chưa có xử lý xung đột).
- Realtime yêu cầu Supabase Realtime đang hoạt động; nếu mạng mất kết nối, tải lại trang để đồng bộ.
- Đăng nhập bằng email chỉ chạy đúng khi trang web được phục vụ qua HTTP(S); không nên mở file HTML trực tiếp để dùng chung.
- Với dữ liệu quan trọng, nên xuất JSON để sao lưu định kỳ. Không sử dụng nơi này để lưu bí mật hoặc tài liệu nhạy cảm nếu chưa đánh giá bảo mật.

## Chạy thử
Mở `index.html` trực tiếp nếu chưa cấu hình cloud, hoặc chạy một static server: `python -m http.server 8000` rồi truy cập http://localhost:8000. Nếu bạn muốn dùng chế độ cloud ở localhost, thêm `http://localhost:8000/` vào danh sách Redirect URLs của Supabase.

## Cấu trúc
- `index.html`: giao diện.
- `app.js`: xử lý task, calendar và đồng bộ.
- `config.js`: cài đặt URL và publishable/anon key của Supabase.
- `schema.sql`: cấu trúc Postgres + chính sách RLS + hàm tạo/tham gia nhóm.
