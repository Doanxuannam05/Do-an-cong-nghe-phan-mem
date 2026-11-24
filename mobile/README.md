# MediGo Mobile – Ứng dụng di động (Expo / React Native)

Ứng dụng di động kết nối Bác sĩ – Người bệnh theo vị trí địa lý, đồng bộ hoàn toàn với hệ thống backend Express + PostgreSQL của dự án MediGo.

---

## 📱 Tính năng chính trên Mobile

1. **Dành cho Người bệnh (Patient):**
   - **Khám ngay tức thì (On-Demand Grab-like):** Tìm và ghép bác sĩ tối ưu dựa trên thuật toán Multi-Criteria (khoảng cách, chuyên khoa, kinh nghiệm, đánh giá, lịch trống) với đồng hồ đếm ngược 30 giây.
   - **Gợi ý Chuyên khoa AI (Symptom Checker):** Nhập mô tả triệu chứng bằng tiếng Việt → Phân tích từ khóa, cảnh báo dấu hiệu cấp cứu và gợi ý top bác sĩ phù hợp nhất lân cận.
   - **Khám phá Bác sĩ theo vị trí:** Lọc bác sĩ theo bán kính (1km, 3km, 5km, 10km), lọc theo chuyên khoa, xem biểu phí tư vấn và thông tin chứng chỉ hành nghề.
   - **Đặt lịch theo khung giờ (Scheduled Slots):** Chọn khung giờ làm việc còn trống của bác sĩ để đặt lịch (chống trùng lịch).
   - **Phòng tư vấn trực tuyến:** Kênh nhắn tin real-time và phòng gọi video mô phỏng WebRTC.
   - **Thanh toán giả lập & Đánh giá sao (1-5★).**

2. **Dành cho Bác sĩ (Doctor):**
   - Bật/tắt công tắc **"Sẵn sàng nhận ca"** (Online / Offline).
   - Nhận thông báo **Yêu cầu khám mới** kèm đếm ngược 30 giây để chấp nhận hoặc từ chối.
   - Quản lý danh sách ca khám đang diễn ra và lịch sử tư vấn.

3. **Cấu hình kết nối linh hoạt:**
   - Cho phép người dùng hoặc người thuyết trình chuyển đổi nhanh địa chỉ API ngay tại màn hình **Cá nhân** (IP LAN Wi-Fi, Android Emulator `10.0.2.2`, hoặc Localhost).

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### Bước 1: Cài đặt thư viện
Mở terminal tại thư mục gốc của dự án:
```bash
cd mobile
npm install
```

### Bước 2: Khởi chạy ứng dụng với Expo
```bash
npx expo start
```
*(hoặc `npm start`)*

Sau khi chạy lệnh trên, giao diện Expo CLI sẽ hiển thị một **Mã QR Code**:

- **Chạy trên điện thoại thật (Khuyên dùng khi demo):**
  1. Tải ứng dụng **Expo Go** trên App Store (iOS) hoặc Google Play (Android).
  2. Đảm bảo điện thoại và máy tính kết nối **chung một mạng Wi-Fi**.
  3. Mở camera điện thoại (iOS) hoặc ứng dụng Expo Go (Android) và quét mã QR trên màn hình terminal.
- **Chạy trên Android Emulator:** Nhấn phím `a` trên bàn phím.
- **Chạy trên iOS Simulator (macOS):** Nhấn phím `i` trên bàn phím.
- **Chạy trên trình duyệt Web:** Nhấn phím `w` trên bàn phím.

---

## 🔑 Tài khoản Demo sẵn có

Đăng nhập nhanh với 1 chạm ngay tại màn hình Đăng nhập:
- **Người bệnh:** `patient@demo.vn` (Mật khẩu: `Demo@123`)
- **Bác sĩ:** `doctor@demo.vn` (Mật khẩu: `Demo@123`)
- **Quản trị viên:** `admin@demo.vn` (Mật khẩu: `Demo@123`)

---

## 📂 Cấu trúc thư mục ứng dụng Mobile

```
mobile/
├── assets/                  # Icon, splash screen và hình ảnh
├── src/
│   ├── context/
│   │   └── AuthContext.tsx  # Quản lý phiên đăng nhập JWT, tự động refresh token
│   ├── navigation/
│   │   └── RootNavigator.tsx# Điều hướng Auth flow, Bottom Tabs và Stack screens
│   ├── screens/
│   │   ├── auth/            # Đăng nhập, Đăng ký (Bác sĩ & Bệnh nhân)
│   │   ├── patient/         # Khám phá, Khám ngay (Radar), Gợi ý AI, Chi tiết BS, Lịch hẹn, Hồ sơ
│   │   ├── doctor/          # Bác sĩ Dashboard, Nhận ca đếm ngược 30s
│   │   └── shared/          # Phòng Chat real-time, Gọi Video WebRTC
│   ├── services/
│   │   └── api.ts           # Tích hợp toàn bộ API Express của MediGo
│   ├── theme/
│   │   └── colors.ts        # Bảng màu chủ đạo Teal y tế
│   └── config.ts            # Cấu hình IP và URL máy chủ backend
├── App.tsx                  # Root component
├── app.json                 # Cấu hình Expo
└── package.json
```
