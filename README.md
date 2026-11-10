# TaskFlow v3 — GitHub JSON, 2 người dùng ngang quyền

Không cần Supabase. Có task chính / task nhỏ, danh mục, người thực hiện, người nhận thông tin, đầu mối, link tài liệu, trạng thái, ngày bắt đầu/deadline, lịch ngày/tuần/tháng, nhập/xuất JSON.

## Kiến trúc bắt buộc: 2 repository

1. **`taskflow-web` (PUBLIC)**: dùng GitHub Pages, chỉ upload `index.html`, `app.js`, `README.md`. **KHÔNG upload folder `data/` vào repo web public nếu dữ liệu riêng tư.**
2. **`taskflow-data` (PRIVATE)**: chỉ upload `data/tasks.json` từ ZIP, trên nhánh `main`. Không bật Pages cho repo này.

### Tạo repository web

- GitHub → New repository → `taskflow-web` → **Public**.
- Upload `index.html` + `app.js` vào thư mục gốc của repo (cùng cấp).
- Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save.
- Website: `https://<github-username>.github.io/taskflow-web/`.

### Tạo repository dữ liệu

- GitHub → New repository → `taskflow-data` → **Private**.
- Upload `data/tasks.json`. GitHub có thể tạo thư mục bằng cách chọn **Add file → Create new file**, nhập `data/tasks.json`, dán nội dung `{ "version": 3, "tasks": [] }`, commit.
- **Khuyến nghị:** tạo một GitHub Organization miễn phí, thêm cả hai tài khoản làm **organization members** rồi tạo `taskflow-data` Private dưới organization. Cấp hai người quyền **Write** trên repository. Cách này giúp mỗi người tạo fine-grained token giới hạn vào chính repository dữ liệu. Nếu tạo repository Private dưới tài khoản cá nhân và mời người thứ hai qua Collaborators, **fine-grained PAT của người cộng tác ngoài không hỗ trợ đầy đủ việc đóng góp vào repository đó** theo tài liệu GitHub; khi ấy cần GitHub App/OAuth phù hợp hoặc classic PAT có quyền `repo` (quyền rất rộng, không được khuyến nghị).
- Cả hai có quyền sửa/xóa bất kỳ task nào trong ứng dụng. Người tạo repo có quyền quản trị repository; đây không phải hai quyền repo giống hệt nhau.

### Mỗi người tạo token riêng

- GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
- Resource owner: GitHub Organization sở hữu repository dữ liệu (cả hai phải là members). Repository access: **Only select repositories** → `taskflow-data`. Permissions → Repository permissions → **Contents: Read and write**; các quyền mặc định khác để tối thiểu. Chọn ngày hết hạn ngắn và gia hạn khi cần.
- Organization có thể yêu cầu admin phê duyệt fine-grained token. Hai người cần quyền Write trong repo dữ liệu. Nếu token không được liệt kê repo, kiểm tra organization membership và approval.
- Trên web TaskFlow: nhập `owner`, `repo=taskflow-data`, `branch=main`, và **token của chính mình** → Kết nối.
- Token chỉ được giữ trong bộ nhớ JavaScript của tab hiện tại, **không lưu vào localStorage, file hay GitHub**. Reload trang sẽ phải nhập lại. Không chia sẻ token cho người khác. Nên dùng trình duyệt cá nhân và không cài extension lạ; XSS/malicious extension vẫn có thể đánh cắp token khi đã nhập.

### Đồng bộ và xung đột

- Web kiểm tra dữ liệu mỗi 30 giây khi tab đang mở và không có hộp thoại sửa task. Nút **Làm mới** cập nhật tức thời theo yêu cầu (không phải realtime push).
- Khi lưu: luôn đọc `tasks.json` mới nhất rồi cập nhật đúng task và gửi PUT kèm blob SHA. Nếu GitHub trả 409, thử tải lại tối đa 3 lần.
- Mỗi task có `revision`. Nếu hai người đã cùng mở một task, người lưu sau nhận thông báo **xung đột** và cần mở lại task; không âm thầm ghi đè.
- Xóa task sử dụng cờ `deleted` để giữ được thông tin phiên bản và phát hiện sửa/xóa xung đột. Có thể khôi phục thủ công qua Git history.
- Lưu là một commit trên GitHub mỗi lần cập nhật, phù hợp lượng task vừa phải; không thay thế database khi lưu liên tục hoặc lượng task lớn.
- File dữ liệu trong repository Private chỉ dành cho người có quyền. **Không nhúng token hoặc dữ liệu riêng tư vào repository web Public.**

### Chuyển dữ liệu từ TaskFlow v2

- Đăng nhập vào v2 → Xuất JSON → mở v3 đã kết nối GitHub → Nhập JSON. Task sẽ được thêm như các công việc mới.

### Trường hợp lỗi

- `401`: token không hợp lệ/hết hạn.
- `403`: token chưa có Contents Read and write, collaborator chưa được cấp quyền, hoặc chính sách tổ chức/giới hạn API.
- `404`: sai owner/repo/branch/path hoặc chưa có quyền đọc Private repo.
- `409`: xung đột SHA, hãy thao tác lại sau khi làm mới.
- Browser mở trang `file://`: hãy dùng website HTTPS đã xuất bản trên GitHub Pages.

**Lưu ý:** Chưa tích hợp thông báo email tự động hoặc tải file thực lên GitHub; chỉ lưu link. Chưa kiểm thử thực địa với token GitHub của bạn — cần kiểm tra trên tài khoản thật.
