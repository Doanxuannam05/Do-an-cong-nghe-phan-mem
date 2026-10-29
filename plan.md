# Kế hoạch: Bỏ MongoDB, gộp toàn bộ dữ liệu về PostgreSQL (phương án C)

**Tóm tắt:** Toàn hệ thống quay về một cơ sở dữ liệu duy nhất là PostgreSQL (có sẵn trong môi trường, không cần máy chủ ngoài). Các phần mới làm thêm trong đợt MongoDB vẫn được giữ, chỉ đổi nơi lưu: nhật ký điều phối, đo thời gian phản hồi API, phòng chat theo booking, trang giám sát. Dữ liệu đang có trong MongoDB được chép ngược về PostgreSQL, không mất gì.

## Các bước

1. **Schema PostgreSQL** – `backend/db/schema.js`
   - Thêm lại các bảng (có PK/FK/index/check như các bảng khác):
     - `conversations` (id = booking_id, 1 phòng / booking), `participants` (mốc đã đọc), `messages`.
     - `notifications`.
     - `doctor_locations` (lịch sử vị trí; index `(doctor_id, recorded_at)` + index `(latitude, longitude)`).
     - `dispatch_events` (mới trên PG): sự kiện OFFERED / ACCEPTED / REJECTED / EXPIRED / NO_DOCTOR_FOUND, điểm matching, thời gian phản hồi.
     - `experiment_runs` (giữ nguyên số thứ tự #1, #2…).
     - `api_metrics` (mới trên PG): thời gian phản hồi từng API; tự xóa bản ghi cũ hơn 30 ngày.
2. **Lớp truy cập** – viết lại phần lưu trữ của `backend/lib/chat.js`, `lib/notify.js`, `lib/telemetry.js` sang PostgreSQL, giữ nguyên interface để các route không phải đổi nhiều.
   - Thông báo, nhật ký điều phối và số đo API được **ghi theo lô**: gộp nhiều bản ghi thành 1 truy vấn mỗi vài giây. Lý do: proxy DB của môi trường chỉ cho khoảng 200 truy vấn mỗi phút.
   - Tin nhắn chat ghi ngay (1 truy vấn / tin), SSE đẩy real-time như cũ.
3. **Routes**
   - `routes/conversations.js`, `notifications.js`, `experiments.js`, `bookings.js` (nhật ký điều phối), `admin.js` (giám sát + lịch sử vị trí), `doctors.js` (lưu vị trí): đổi truy vấn MongoDB thành SQL.
   - API trả về giữ nguyên định dạng nên giao diện không phải sửa nhiều.
4. **Chuyển dữ liệu ngược** – `backend/lib/migrate-from-mongo.js` (chạy một lần): chép phòng chat, tin nhắn, thông báo, lịch sử vị trí, nhật ký điều phối và kết quả thực nghiệm từ MongoDB cục bộ về PostgreSQL. Đánh dấu xong trong `app_meta`.
5. **Gỡ MongoDB**
   - Xóa `lib/mongo.js`, `lib/migrate-mongo.js`, `tests/mongo.test.js`, gói `mongodb`, các dòng `MONGODB_*` trong `.env` / `.env.example`.
   - Tắt tiến trình MongoDB tạm trên máy dev.
   - Seed dữ liệu ghi thẳng vào PostgreSQL.
6. **Giao diện Admin**
   - `pages/admin/System.tsx`: bỏ khối MongoDB, thay bằng số bản ghi các bảng chat / thông báo / nhật ký điều phối / metrics và hàng đợi ghi theo lô. Giữ bảng "Thời gian phản hồi API".
   - `pages/shared/BookingDetail.tsx`: nhãn "Nhật ký điều phối" đổi nguồn sang PostgreSQL.
7. **Kiểm thử**
   - `npm test`: unit test cũ + test mới cho chat / thông báo / ghi theo lô trên PostgreSQL.
   - `tests/integration.sh` (bao gồm chat và thông báo).
   - Kiểm tra giao diện bằng trình duyệt tự động; build production sạch lỗi.

---

## Tiến độ (đã triển khai)
- [x] Bước 1: thêm lại 7 bảng PostgreSQL (`conversations` id = booking_id, `participants`, `messages`, `notifications` id UUID, `doctor_locations`, `dispatch_events`, `experiment_runs`, `api_metrics`) – đủ PK/FK/index/check.
- [x] Bước 2: `lib/batch.js` (ghi theo lô, giữ lại khi lỗi tạm thời, bỏ lô khi lỗi dữ liệu), `lib/chat.js`, `lib/notify.js`, `lib/telemetry.js` chạy trên PostgreSQL.
- [x] Bước 3: routes chat / thông báo / thực nghiệm / booking / admin / bác sĩ dùng SQL.
- [x] Bước 4: `scripts/migrate-from-mongo.js` đã chép 15 phòng chat, 44 tin nhắn, 50 thông báo, 60 vị trí, 6 sự kiện điều phối, 3 lần thực nghiệm, 68 số đo API về PostgreSQL (ghi nhận trong `app_meta.mongo_imported`). Script nằm ở `scripts/` thay vì `lib/` vì chỉ chạy một lần.
- [x] Bước 5: đã xóa `lib/mongo.js`, `lib/migrate-mongo.js`, `tests/mongo.test.js`, gói `mongodb`, file `.env`; đã tắt MongoDB tạm và xóa dữ liệu của nó.
- [x] Bước 6: Admin › Giám sát hệ thống hiển thị số bản ghi các bảng ghi nhiều + hàng đợi ghi theo lô + thời gian phản hồi API.
- [x] Bước 7: `npm test` 40/40 (thêm 8 test lưu trữ, có 1 test ghi/đọc PostgreSQL thật), `tests/integration.sh` đạt, kiểm tra giao diện không lỗi, build production ok.
