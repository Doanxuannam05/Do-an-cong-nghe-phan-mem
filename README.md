# MediGo – Nền tảng kết nối người bệnh với bác sĩ theo vị trí địa lý

Prototype phục vụ đề tài NCKH sinh viên **"Nghiên cứu và xây dựng nền tảng kết nối người bệnh với bác sĩ theo yêu cầu dựa trên vị trí địa lý"** – mô hình Grab-like:

`Patient → Request → Find Nearby Doctors → Matching → Doctor Accept → Consultation → Payment → Rating`

> Toàn bộ bác sĩ, phòng khám, người bệnh là **dữ liệu mô phỏng tại Đà Nẵng**. Hệ thống **không chẩn đoán bệnh** – chỉ gợi ý chuyên khoa kèm disclaimer.

## Tài khoản demo (mật khẩu `Demo@123`)
| Vai trò | Email |
|---|---|
| Người bệnh | patient@demo.vn |
| Bác sĩ | doctor@demo.vn |
| Quản trị | admin@demo.vn |
| 59 bác sĩ mô phỏng | bs001@sim.medigo.vn … bs059@sim.medigo.vn |
| 120 người bệnh mô phỏng | bn001@sim.medigo.vn … bn120@sim.medigo.vn |

## Chức năng chính
- **Người bệnh (web mobile-first):** bản đồ OpenStreetMap, tìm bác sĩ trong bán kính 1/3/5/10 km, lọc/sắp xếp, đặt lịch theo slot (chống double booking), **Khám ngay** (matching + dispatch, timeout 30 giây, tự chuyển bác sĩ kế tiếp, tự mở rộng bán kính), chat real-time, gọi video WebRTC, thanh toán giả lập, đánh giá, khiếu nại, gợi ý chuyên khoa từ triệu chứng.
- **Bác sĩ:** online/offline, sẵn sàng nhận bệnh, popup nhận ca đếm ngược 30 giây, lịch làm việc tuần + slot, phiên khám & ghi chú, thống kê cá nhân, chia sẻ vị trí.
- **Quản trị:** dashboard + biểu đồ, duyệt hồ sơ bác sĩ, quản lý người dùng / lịch khám / thanh toán / đánh giá / khiếu nại / chuyên khoa / phòng khám, giám sát hệ thống (thời gian truy vấn, độ trễ real-time, thời gian phản hồi API).
- **Thực nghiệm NCKH:** 3 thí nghiệm (Random vs Nearest vs Multi-Criteria; trọng số khoảng cách 20/40/60%; quy mô 100–5.000 bác sĩ), lặp nhiều seed, mean ± sd, xuất CSV.

## Thuật toán Matching (trọng tâm nghiên cứu)
```
Score = 0.40·Distance + 0.25·Specialty + 0.15·Availability + 0.10·Rating + 0.10·Experience
```
Chi tiết (input, processing, output, độ phức tạp, ưu/nhược điểm, cách đánh giá) trong `backend/lib/matching.js`; mô hình mô phỏng trong `backend/lib/simulator.js`; dispatch & state machine trong `backend/lib/dispatch.js`, `backend/lib/stateMachine.js`.

## Công nghệ
| Lớp | Công nghệ |
|---|---|
| Frontend Web | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router, Leaflet, ECharts |
| Mobile App | React Native, Expo SDK 52, TypeScript, React Navigation, Async Storage |
| Backend | Node.js, Express, Zod (validation), JWT HS256 + refresh token xoay vòng, scrypt (băm mật khẩu), RBAC |
| Real-time | Server-Sent Events (server → client) + REST (client → server); WebRTC cho video |
| Database | PostgreSQL (27 bảng, khai báo bằng Drizzle ORM trong `backend/db/schema.js`) |

## Cấu trúc thư mục
```
backend/
  server.js              khởi động Express (routes tự mount tại /api/<tên file>)
  db/schema.js           định nghĩa bảng PostgreSQL (PK, FK, index, unique, check)
  lib/                   matching, dispatch, stateMachine, simulator, auth, chat, notify, batch, seed…
  routes/                19 nhóm API (~80 endpoint): auth, doctors, bookings, consultations, conversations, admin, experiments…
  scripts/               tiện ích chạy một lần
  tests/                 core.test.js, storage.test.js (node --test), integration.sh
frontend/
  src/App.tsx            định tuyến 3 vai trò
  src/pages/patient|doctor|admin|shared|auth
  src/components/        MapView, kit UI, layouts, IncomingOffer, IncomingCall
  src/lib/               http (JWT + refresh), realtime (SSE), format, location, mapProvider
mobile/
  App.tsx                giao diện di động chính Expo
  src/screens/           màn hình người bệnh, bác sĩ, chat, gọi video, khám ngay (Grab-like)
  src/services/api.ts    kết nối toàn diện với Backend API
  src/navigation/        RootNavigator & Bottom Tabs
plan.md                  kế hoạch & nhật ký triển khai theo sprint
```

## Chạy dự án
Yêu cầu: Node.js ≥ 20 (hoặc Bun).

```bash
cd backend  && npm install      # hoặc: bun install
cd frontend && npm install
cd mobile   && npm install
```

**Lưu ý về cơ sở dữ liệu:** dự án được xây dựng trên nền tảng Surf Studio; backend truy cập PostgreSQL qua `@surf-ai/sdk/db` (tự tạo bảng từ `db/schema.js`, tự seed dữ liệu ở lần chạy đầu). Để chạy ngoài nền tảng cần:
- biến môi trường `BACKEND_PORT=3001` và `SURF_API_KEY=<khóa của bạn>` (xem `backend/.env.example`), **hoặc**
- thay `backend/lib/db.js` bằng kết nối PostgreSQL trực tiếp (gói `pg`) và tạo bảng bằng drizzle-kit từ `db/schema.js`.

```bash
cd backend  && npm run dev       # API: http://localhost:3001/api
cd frontend && npm run dev       # Web: http://localhost:5173
cd mobile   && npx expo start    # Mobile: Quét mã QR qua app Expo Go
```

## Kiểm thử
```bash
cd backend
npm test                  # unit test: khoảng cách, matching score, state machine, gợi ý chuyên khoa, auth, mô phỏng, ghi theo lô
npm run test:integration  # luồng đầy đủ: RBAC → khám ngay → nhận ca → chat → khám → thanh toán → đánh giá → chống double booking
```

## Bảo mật & dữ liệu y tế
Mật khẩu băm scrypt (không lưu plaintext) · JWT + refresh token · RBAC ở API · validation Zod · rate limit · truy vấn tham số hóa (chống SQL injection) · bác sĩ chỉ thấy đầy đủ thông tin người bệnh sau khi nhận ca · không dùng dữ liệu y tế thật.
