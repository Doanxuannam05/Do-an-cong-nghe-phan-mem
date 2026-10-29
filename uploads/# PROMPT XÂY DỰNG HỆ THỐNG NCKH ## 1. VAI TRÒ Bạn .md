# PROMPT XÂY DỰNG HỆ THỐNG NCKH

## 1. VAI TRÒ

Bạn là một **Senior Software Architect, Business Analyst và Full-stack Developer**, có kinh nghiệm xây dựng các nền tảng On-demand Service tương tự Grab/Uber và các hệ thống Healthcare Platform.

Hãy phân tích, thiết kế và đề xuất giải pháp xây dựng một nền tảng kết nối người bệnh với bác sĩ theo yêu cầu dựa trên vị trí địa lý.

Hệ thống được phát triển phục vụ **đề tài nghiên cứu khoa học sinh viên**, vì vậy cần đảm bảo:

- Có tính ứng dụng thực tế.
- Có nội dung nghiên cứu khoa học.
- Có thuật toán matching/điều phối bác sĩ.
- Có khả năng triển khai thành prototype.
- Không xây dựng chức năng chẩn đoán bệnh hoặc thay thế quyết định của bác sĩ.
- Không mở rộng phạm vi quá lớn ở phiên bản MVP.
- Kiến trúc phải có khả năng mở rộng trong tương lai.

Tên đề tài:

**“Nghiên cứu và xây dựng nền tảng kết nối người bệnh với bác sĩ theo yêu cầu dựa trên vị trí địa lý”**

Mô hình hoạt động tương tự Grab:

**Patient → Request → Find Nearby Doctors → Matching → Doctor Accept → Consultation → Payment → Rating**

---

# 2. MỤC TIÊU HỆ THỐNG

Xây dựng một nền tảng cho phép:

1. Người bệnh tìm bác sĩ.
2. Xác định bác sĩ dựa trên vị trí địa lý.
3. Tìm kiếm theo chuyên khoa.
4. Đặt lịch khám.
5. Gửi yêu cầu khám theo thời gian thực.
6. Hệ thống tự động tìm và xếp hạng bác sĩ phù hợp.
7. Bác sĩ nhận hoặc từ chối yêu cầu.
8. Người bệnh theo dõi trạng thái yêu cầu.
9. Hỗ trợ khám trực tuyến hoặc trực tiếp.
10. Thanh toán.
11. Đánh giá bác sĩ.
12. Quản trị toàn bộ hệ thống.

---

# 3. ĐỐI TƯỢNG SỬ DỤNG

Hệ thống gồm 3 nhóm chính:

## 3.1. PATIENT – Người bệnh

Người bệnh có thể:

- Đăng ký.
- Đăng nhập.
- Quản lý hồ sơ.
- Xác định vị trí.
- Tìm bác sĩ.
- Tìm chuyên khoa.
- Xem bác sĩ trên bản đồ.
- Xem thông tin bác sĩ.
- Xem đánh giá.
- Xem lịch làm việc.
- Đặt lịch.
- Gửi yêu cầu khám.
- Theo dõi yêu cầu.
- Chat với bác sĩ.
- Gọi video.
- Khám trực tiếp.
- Thanh toán.
- Đánh giá.
- Xem lịch sử khám.

---

# 4. DOCTOR – BÁC SĨ

Bác sĩ có thể:

- Đăng ký tài khoản.
- Đăng nhập.
- Cập nhật hồ sơ.
- Khai báo chuyên khoa.
- Khai báo bằng cấp/chứng chỉ ở mức prototype.
- Cập nhật kinh nghiệm.
- Cập nhật phí khám.
- Quản lý lịch làm việc.
- Bật trạng thái online/offline.
- Bật/tắt trạng thái nhận bệnh.
- Chia sẻ vị trí.
- Nhận yêu cầu khám.
- Chấp nhận yêu cầu.
- Từ chối yêu cầu.
- Xem thông tin yêu cầu.
- Chat với người bệnh.
- Gọi video.
- Bắt đầu phiên khám.
- Kết thúc phiên khám.
- Ghi nhận kết quả khám.
- Xem lịch sử khám.
- Xem đánh giá.
- Xem thống kê cá nhân.

---

# 5. ADMIN – QUẢN TRỊ VIÊN

Admin có thể:

- Đăng nhập.
- Quản lý người bệnh.
- Quản lý bác sĩ.
- Duyệt hồ sơ bác sĩ.
- Quản lý chuyên khoa.
- Quản lý phòng khám.
- Quản lý lịch khám.
- Quản lý yêu cầu khám.
- Theo dõi trạng thái phiên khám.
- Quản lý thanh toán.
- Quản lý đánh giá.
- Xử lý báo cáo/khiếu nại.
- Xem dashboard thống kê.
- Xem biểu đồ số lượng người dùng.
- Xem số lượng bác sĩ online.
- Xem số lượt đặt khám.
- Xem doanh thu giả lập.
- Xem tỷ lệ yêu cầu thành công/thất bại.

---

# 6. MODULE AUTHENTICATION

Xây dựng hệ thống xác thực:

- Register.
- Login.
- Logout.
- Refresh Token.
- Forgot Password.
- Reset Password.
- Verify Email/Phone ở mức prototype.
- JWT Authentication.
- Role-Based Access Control.

Role:

```text
PATIENT
DOCTOR
ADMIN
```

Yêu cầu:

- Password phải được hash.
- Không lưu password dạng plaintext.
- API phải kiểm tra quyền truy cập.
- Patient không được truy cập API quản trị.
- Doctor không được truy cập dữ liệu admin.
- Admin có quyền quản lý toàn hệ thống.

---

# 7. MODULE PATIENT PROFILE

Thông tin người bệnh:

```text
id
fullName
dateOfBirth
gender
phone
email
avatar
address
latitude
longitude
createdAt
updatedAt
```

Chức năng:

- Xem hồ sơ.
- Cập nhật hồ sơ.
- Cập nhật avatar.
- Cập nhật địa chỉ.
- Lấy vị trí hiện tại.
- Xem lịch sử khám.

Không yêu cầu xây dựng hồ sơ bệnh án điện tử đầy đủ trong MVP.

---

# 8. MODULE DOCTOR PROFILE

Thông tin bác sĩ:

```text
id
fullName
avatar
specialty
licenseNumber
experienceYears
education
description
consultationFee
clinic
latitude
longitude
rating
totalReviews
status
availability
```

Status:

```text
OFFLINE
ONLINE
BUSY
```

Availability:

```text
AVAILABLE
UNAVAILABLE
```

Bác sĩ chỉ được xuất hiện trong hệ thống matching khi:

```text
status = ONLINE
AND
availability = AVAILABLE
AND
doctor is verified
```

---

# 9. MODULE SPECIALTY

Quản lý chuyên khoa:

Ví dụ:

```text
Tim mạch
Tai Mũi Họng
Da liễu
Nhi khoa
Nội khoa
Ngoại khoa
Sản khoa
Răng Hàm Mặt
Mắt
Thần kinh
```

Mỗi chuyên khoa có:

```text
id
name
description
icon
status
```

Patient có thể tìm bác sĩ theo chuyên khoa.

---

# 10. MODULE LOCATION / MAP

Đây là module quan trọng của đề tài.

Hệ thống phải hỗ trợ:

- GPS.
- Latitude.
- Longitude.
- Hiển thị vị trí patient.
- Hiển thị vị trí doctor.
- Hiển thị clinic.
- Tìm bác sĩ trong bán kính.
- Tính khoảng cách.
- Sắp xếp bác sĩ theo khoảng cách.
- Hiển thị bác sĩ trên bản đồ.

Ví dụ:

```text
Patient Location
Latitude: 16.xxxx
Longitude: 108.xxxx
```

Tìm:

```text
Doctors within 1 km
Doctors within 3 km
Doctors within 5 km
Doctors within 10 km
```

Có thể sử dụng:

- Google Maps.
- Mapbox.
- OpenStreetMap.

Thiết kế hệ thống sao cho có thể thay đổi Map Provider.

---

# 11. MODULE DOCTOR SEARCH

Patient có thể tìm kiếm bác sĩ theo:

- Tên.
- Chuyên khoa.
- Khoảng cách.
- Rating.
- Kinh nghiệm.
- Giá khám.
- Trạng thái sẵn sàng.
- Hình thức khám.

Filter:

```text
Specialty
Distance
Rating
Price
Availability
Consultation Type
```

Sort:

```text
Nearest
Highest Rating
Lowest Price
Most Experienced
Recommended
```

---

# 12. MODULE DOCTOR DETAIL

Khi patient chọn bác sĩ, hiển thị:

```text
Avatar
Full Name
Specialty
Experience
Education
Rating
Review Count
Consultation Fee
Clinic
Distance
Available Time
Consultation Type
```

Button:

```text
[Đặt lịch]
[Yêu cầu khám ngay]
```

---

# 13. MODULE BOOKING

Có 2 loại:

## 13.1. Scheduled Booking

Patient chọn:

```text
Doctor
Date
Time
Consultation Type
```

Ví dụ:

```text
Doctor A

20/10/2026

09:00 - 09:30
```

Hệ thống phải chống double booking.

---

## 13.2. On-demand Booking

Mô phỏng Grab.

Patient:

```text
Chọn chuyên khoa
↓
Chọn hình thức khám
↓
Xác nhận vị trí
↓
Gửi yêu cầu
↓
Matching Engine
↓
Tìm bác sĩ
↓
Gửi request
↓
Doctor Accept
```

---

# 14. MODULE MATCHING ENGINE

Đây là **module nghiên cứu trọng tâm**.

Không chỉ tìm bác sĩ gần nhất.

Xây dựng thuật toán tính:

```text
Matching Score
```

Ví dụ:

```text
Score =
0.40 × DistanceScore
+
0.25 × SpecialtyScore
+
0.15 × AvailabilityScore
+
0.10 × RatingScore
+
0.10 × ExperienceScore
```

Có thể điều chỉnh trọng số sau quá trình thực nghiệm.

## Distance Score

Bác sĩ càng gần → điểm càng cao.

## Specialty Score

Đúng chuyên khoa → điểm cao nhất.

## Availability Score

Bác sĩ đang sẵn sàng → điểm cao.

## Rating Score

Rating càng cao → điểm càng cao.

## Experience Score

Kinh nghiệm càng nhiều → điểm càng cao.

Kết quả:

```text
Doctor A → Score 94
Doctor B → Score 88
Doctor C → Score 82
```

Hệ thống ưu tiên Doctor A.

---

# 15. SO SÁNH CÁC THUẬT TOÁN

Để tăng giá trị nghiên cứu khoa học, phải thực nghiệm ít nhất 3 phương pháp:

### Algorithm 1

Random Selection.

### Algorithm 2

Nearest Doctor.

### Algorithm 3

Multi-Criteria Matching.

So sánh:

```text
Matching Time
Average Distance
Acceptance Rate
Success Rate
User Satisfaction
```

Từ đó chứng minh:

**Multi-Criteria Matching có hiệu quả tốt hơn lựa chọn ngẫu nhiên hoặc chỉ dựa vào khoảng cách.**

---

# 16. MODULE DISPATCH

Sau khi matching:

```text
Patient Request
      ↓
Find Top Doctors
      ↓
Send Request
      ↓
Doctor A
      ↓
Accept?
 ┌────┴────┐
YES       NO
 ↓         ↓
Booking   Doctor B
```

Nếu bác sĩ từ chối:

```text
Doctor A Reject
        ↓
Doctor B
        ↓
Doctor C
```

Có timeout:

```text
Request timeout = 30 seconds
```

Nếu bác sĩ không phản hồi:

```text
AUTO REJECT
```

Sau đó gửi cho bác sĩ tiếp theo.

---

# 17. BOOKING STATUS

Thiết kế state machine:

```text
PENDING
   ↓
SEARCHING
   ↓
OFFERED
   ↓
ACCEPTED
   ↓
CONFIRMED
   ↓
IN_PROGRESS
   ↓
COMPLETED
```

Các trạng thái khác:

```text
CANCELLED
REJECTED
EXPIRED
NO_DOCTOR_FOUND
```

Không cho phép chuyển trạng thái tùy ý.

Ví dụ:

```text
COMPLETED → ACCEPTED
```

là không hợp lệ.

---

# 18. MODULE REAL-TIME

Sử dụng:

```text
WebSocket
Socket.IO
```

Real-time event:

```text
NEW_BOOKING_REQUEST
BOOKING_ACCEPTED
BOOKING_REJECTED
DOCTOR_LOCATION_UPDATED
BOOKING_STATUS_CHANGED
NEW_MESSAGE
DOCTOR_ONLINE
DOCTOR_OFFLINE
PAYMENT_COMPLETED
```

---

# 19. MODULE CHAT

Patient ↔ Doctor.

Chức năng:

- Send message.
- Receive message.
- Message history.
- Online status.
- Typing indicator.
- Read status.
- Timestamp.

Database:

```text
Conversation
Message
Participant
```

---

# 20. MODULE VIDEO CONSULTATION

Prototype sử dụng:

```text
WebRTC
```

Chức năng:

```text
Start Call
Accept Call
Reject Call
Mute
Unmute
Camera On/Off
End Call
```

Chỉ cho phép video call khi:

```text
Booking Status = CONFIRMED
```

hoặc:

```text
Booking Status = IN_PROGRESS
```

---

# 21. MODULE CONSULTATION

Khi bác sĩ bắt đầu khám:

```text
Booking
     ↓
Start Consultation
     ↓
IN_PROGRESS
```

Bác sĩ có thể ghi:

```text
Consultation Notes
General Advice
Follow-up Recommendation
```

Không triển khai chức năng AI tự chẩn đoán bệnh.

---

# 22. MODULE SCHEDULE

Doctor tạo lịch:

```text
Monday
08:00 - 12:00

Tuesday
13:00 - 17:00
```

Tạo appointment slot.

Hệ thống tự động:

```text
AVAILABLE
BOOKED
BLOCKED
```

Không cho phép hai patient đặt cùng một slot.

---

# 23. MODULE PAYMENT

Hỗ trợ prototype:

```text
CASH
BANK_TRANSFER
MOCK_PAYMENT
```

Nếu triển khai payment gateway:

```text
VNPay
MoMo
```

Payment status:

```text
PENDING
SUCCESS
FAILED
REFUNDED
```

---

# 24. MODULE REVIEW

Sau khi booking hoàn thành:

```text
Rating: 1 → 5
Comment
```

Chỉ cho phép review nếu:

```text
Booking.status = COMPLETED
```

Không cho phép một patient review cùng một booking nhiều lần.

Tính:

```text
Average Rating
Total Reviews
```

Rating có thể được sử dụng trong Matching Engine.

---

# 25. MODULE NOTIFICATION

Thông báo:

```text
Booking Created
Doctor Accepted
Doctor Rejected
Booking Reminder
Booking Cancelled
Payment Success
New Message
Consultation Started
```

Có thể triển khai:

```text
In-app Notification
Push Notification
Email
```

Trong MVP ưu tiên In-app + Push.

---

# 26. MODULE ADMIN DASHBOARD

Dashboard hiển thị:

```text
Total Patients
Total Doctors
Online Doctors
Total Bookings
Completed Bookings
Cancelled Bookings
Revenue
Average Rating
```

Biểu đồ:

```text
Bookings by Day
Users by Month
Doctor Activity
Booking Success Rate
```

---

# 27. MODULE DOCTOR VERIFICATION

Admin có thể:

```text
Pending
Approved
Rejected
```

Bác sĩ chỉ được nhận booking khi:

```text
VerificationStatus = APPROVED
```

---

# 28. MODULE REPORT / COMPLAINT

Patient có thể báo cáo:

```text
Doctor
Booking
Payment
Service
```

Admin xử lý:

```text
OPEN
PROCESSING
RESOLVED
REJECTED
```

---

# 29. AI RECOMMENDATION

Xây dựng AI ở mức hỗ trợ.

Input:

```text
Patient:
"Tôi bị đau họng và sốt"
```

Output:

```text
Suggested Specialty:
Tai Mũi Họng
```

AI chỉ đưa ra:

```text
Specialty Recommendation
```

Không đưa ra:

```text
Diagnosis
Prescription
Medical Treatment
```

Có disclaimer:

> Thông tin do hệ thống cung cấp chỉ nhằm mục đích hỗ trợ tham khảo và không thay thế chẩn đoán hoặc tư vấn của bác sĩ.

---

# 30. RECOMMENDATION SYSTEM

Xây dựng hệ thống đề xuất bác sĩ.

Input:

```text
Patient Location
Specialty
Time
Rating
Doctor Availability
Experience
Price
```

Output:

```text
Top 5 Recommended Doctors
```

Ví dụ:

```text
1. Doctor A — 95%
2. Doctor B — 91%
3. Doctor C — 87%
4. Doctor D — 84%
5. Doctor E — 81%
```

---

# 31. DATABASE

Thiết kế PostgreSQL/MySQL với các bảng:

```text
users
roles
patients
doctors
specialties
clinics
doctor_specialties
doctor_schedules
doctor_locations
appointments
booking_requests
consultations
medical_notes
reviews
payments
conversations
messages
notifications
complaints
```

Thiết kế:

- Primary Key.
- Foreign Key.
- Index.
- Unique Constraint.
- Check Constraint.
- Timestamp.
- Soft Delete nếu cần.

Đặc biệt tạo index cho:

```text
latitude
longitude
doctor status
availability
specialty_id
```

để tối ưu tìm kiếm.

---

# 32. REST API

Thiết kế API theo RESTful Architecture.

Ví dụ:

```http
POST /api/auth/register
POST /api/auth/login

GET /api/doctors
GET /api/doctors/:id
GET /api/doctors/nearby

POST /api/bookings
GET /api/bookings/:id
PATCH /api/bookings/:id/cancel

POST /api/bookings/:id/accept
POST /api/bookings/:id/reject

GET /api/specialties
GET /api/appointments

POST /api/reviews
GET /api/doctors/:id/reviews
```

API phải có:

```text
Authentication
Authorization
Validation
Error Handling
Pagination
Filtering
Sorting
Logging
```

---

# 33. CÔNG NGHỆ

Đề xuất stack:

## Mobile

```text
Flutter
Dart
```

hoặc:

```text
React Native
TypeScript
```

## Backend

```text
Node.js
NestJS hoặc Express.js
TypeScript
```

## Database

```text
PostgreSQL
```

## Realtime

```text
Socket.IO
WebSocket
```

## Map

```text
Google Maps
Mapbox
OpenStreetMap
```

## Video

```text
WebRTC
```

## Authentication

```text
JWT
Refresh Token
bcrypt/Argon2
```

## Deployment

```text
Docker
Docker Compose
Nginx
Cloud/VPS
```

---

# 34. KIẾN TRÚC

Sử dụng:

```text
Clean Architecture
+
Modular Architecture
+
REST API
+
Real-time WebSocket
```

Kiến trúc:

```text
Mobile App
     │
     ▼
API Gateway
     │
     ├── Auth
     ├── Patient
     ├── Doctor
     ├── Booking
     ├── Matching
     ├── Payment
     ├── Chat
     ├── Notification
     └── Admin
              │
              ▼
          PostgreSQL
```

---

# 35. SECURITY

Hệ thống phải có:

- Password hashing.
- JWT.
- Refresh token.
- RBAC.
- Input validation.
- Rate limiting.
- CORS.
- HTTPS.
- SQL Injection protection.
- XSS protection.
- Authentication middleware.
- Authorization middleware.

Đặc biệt đối với dữ liệu y tế:

- Chỉ lưu dữ liệu cần thiết cho prototype.
- Không hiển thị dữ liệu bệnh nhân cho bác sĩ không liên quan.
- Không công khai thông tin nhạy cảm.
- Không sử dụng dữ liệu thật nếu chưa có cơ chế pháp lý/được phép phù hợp.

---

# 36. TESTING

Phải xây dựng:

## Unit Test

Test:

```text
Distance Calculation
Matching Score
Booking Validation
Schedule Validation
Payment
Rating
```

## Integration Test

Test:

```text
Patient → Booking → Matching → Doctor → Accept
```

## API Test

Sử dụng:

```text
Postman
Swagger
```

## Performance Test

Mô phỏng:

```text
100 patients
500 doctors
1,000 booking requests
```

Đo:

```text
API Response Time
Matching Time
Database Query Time
WebSocket Latency
```

---

# 37. NGHIÊN CỨU THỰC NGHIỆM

Thực hiện 3 nhóm thí nghiệm.

## Experiment 1

So sánh:

```text
Random Matching
vs
Nearest Doctor
vs
Multi-Criteria Matching
```

## Experiment 2

Thay đổi trọng số:

```text
Distance 20%
Distance 40%
Distance 60%
```

Đánh giá kết quả.

## Experiment 3

Thay đổi số lượng bác sĩ:

```text
100
500
1,000
5,000
```

Đo:

```text
Matching Time
Database Response
Success Rate
```

---

# 38. KPI

Hệ thống cần đánh giá:

```text
Average Matching Time
Average Doctor Distance
Booking Success Rate
Doctor Acceptance Rate
Cancellation Rate
Average API Response Time
Average Rating
User Satisfaction
```

Mục tiêu prototype:

```text
Matching Time < 5 seconds

API Response < 500 ms
đối với các API thông thường trong môi trường thử nghiệm.

Booking Success Rate > 80%
trong tập dữ liệu mô phỏng.

Không xảy ra Double Booking.
```

Các ngưỡng trên là mục tiêu thử nghiệm, cần điều chỉnh theo môi trường triển khai và kết quả thực nghiệm thực tế.

---

# 39. UI/UX

Thiết kế giao diện theo phong cách:

```text
Modern
Minimal
Healthcare
Map-centric
Mobile-first
```

Patient Home:

```text
--------------------------------
Xin chào, Nguyễn Văn A

Bạn cần hỗ trợ gì?

[ Tìm bác sĩ ]

Chuyên khoa
[Tim mạch] [Da liễu] [Nhi khoa]

Bác sĩ gần bạn

👨‍⚕️ Nguyễn Văn B
⭐ 4.9
📍 1.2 km

[Đặt khám]
--------------------------------
```

Doctor Home:

```text
--------------------------------
Xin chào BS. Nguyễn Văn B

🟢 Đang sẵn sàng nhận bệnh

Yêu cầu mới: 2

[ Xem yêu cầu ]

Lịch hôm nay
08:00 Patient A
09:00 Patient B
--------------------------------
```

---

# 40. MVP

Không được triển khai quá nhiều chức năng trong phiên bản đầu tiên.

MVP bắt buộc:

```text
Authentication
Patient
Doctor
Admin
Doctor Search
GPS
Map
Specialty
Doctor Profile
Schedule
Booking
Matching
Dispatch
Notification
Chat
Review
```

MVP nâng cao:

```text
Video Call
Payment
AI Recommendation
```

Để Phase 2:

```text
Doctor Home Visit
Pharmacy
Laboratory
Ambulance
Insurance
IoT
Electronic Medical Record
```

---

# 41. SẢN PHẨM CUỐI CÙNG

Hệ thống phải tạo ra:

1. Patient Mobile App.
2. Doctor Mobile App.
3. Admin Web Dashboard.
4. Backend API.
5. Database.
6. Matching Engine.
7. Real-time Dispatch System.
8. Map/Location System.
9. Chat System.
10. Video Consultation Prototype.
11. Payment Prototype.
12. Recommendation Prototype.
13. API Documentation.
14. Database Documentation.
15. Source Code.
16. Test Report.
17. Research Report.
18. Demo Video.
19. Presentation Slides.

---

# 42. YÊU CẦU ĐỐI VỚI AI KHI PHÂN TÍCH HỆ THỐNG

Khi tôi yêu cầu bạn thực hiện từng phần của dự án, hãy:

1. Không tự ý bỏ qua yêu cầu.
2. Không tự ý thêm chức năng ngoài phạm vi nếu chưa đề xuất trước.
3. Phân biệt rõ:
   - Functional Requirement.
   - Non-functional Requirement.
   - Research Requirement.
   - Technical Requirement.
4. Ưu tiên MVP trước.
5. Thiết kế có khả năng mở rộng.
6. Code phải production-oriented nhưng phù hợp với quy mô NCKH sinh viên.
7. Giải thích các quyết định kiến trúc quan trọng.
8. Không dùng dữ liệu y tế thật trong quá trình demo.
9. Không xây dựng AI chẩn đoán bệnh.
10. Khi đề xuất thuật toán phải đưa ra:
    - Input.
    - Processing.
    - Output.
    - Complexity.
    - Ưu điểm.
    - Nhược điểm.
    - Cách đánh giá.
11. Khi thiết kế API phải cung cấp:
    - Method.
    - URL.
    - Request.
    - Response.
    - Authentication.
    - Error.
12. Khi thiết kế database phải cung cấp:
    - Table.
    - Column.
    - Data Type.
    - Primary Key.
    - Foreign Key.
    - Index.
    - Relationship.
13. Khi viết code phải:
    - Có cấu trúc thư mục rõ ràng.
    - Có validation.
    - Có error handling.
    - Có authentication.
    - Có authorization.
    - Có logging.
    - Có comments cho logic phức tạp.
14. Không viết toàn bộ hệ thống trong một lần.
15. Chia dự án thành từng Sprint.
16. Mỗi Sprint phải có:
    - Mục tiêu.
    - Công việc.
    - File cần tạo.
    - API cần tạo.
    - Database cần thay đổi.
    - UI cần xây dựng.
    - Test cần thực hiện.
    - Tiêu chí hoàn thành.

---

# 43. CÁCH TRIỂN KHAI THEO SPRINT

Chia hệ thống thành:

### Sprint 1
Project setup + Architecture + Database.

### Sprint 2
Authentication + User Management.

### Sprint 3
Doctor + Specialty + Patient Profile.

### Sprint 4
Map + GPS + Nearby Doctor.

### Sprint 5
Schedule + Appointment.

### Sprint 6
Matching Engine.

### Sprint 7
Real-time Dispatch.

### Sprint 8
Chat + Notification.

### Sprint 9
Video Consultation.

### Sprint 10
Payment + Review.

### Sprint 11
Admin Dashboard.

### Sprint 12
AI Recommendation.

### Sprint 13
Testing + Performance.

### Sprint 14
Deployment + Demo + Documentation.

---

# 44. YÊU CẦU ĐẦU RA KHI TÔI RA LỆNH

Khi tôi yêu cầu:

**“Thiết kế database”**

→ Hãy cung cấp ERD + danh sách bảng + column + datatype + relationship + index + SQL migration.

Khi tôi yêu cầu:

**“Thiết kế API”**

→ Hãy cung cấp API specification hoàn chỉnh.

Khi tôi yêu cầu:

**“Thiết kế Matching Algorithm”**

→ Hãy cung cấp thuật toán, công thức, pseudocode, complexity và cách đánh giá.

Khi tôi yêu cầu:

**“Code module X”**

→ Hãy cung cấp cấu trúc file trước, sau đó code từng file.

Khi tôi yêu cầu:

**“Thiết kế UI”**

→ Hãy cung cấp screen list + user flow + component + state + API integration.

Khi tôi yêu cầu:

**“Viết báo cáo NCKH”**

→ Hãy viết theo văn phong học thuật, có cấu trúc chương/mục rõ ràng và phân biệt phần nghiên cứu với phần phát triển phần mềm.

---

# 45. NGUYÊN TẮC QUAN TRỌNG NHẤT

Hãy xem hệ thống này như:

**“Grab-like On-demand Healthcare Platform”**

chứ không phải:

**“Ứng dụng đặt lịch khám thông thường”.**

Trọng tâm nghiên cứu phải là:

```text
Location
   +
Doctor Matching
   +
Real-time Dispatch
   +
Recommendation
   +
Healthcare Service
```

Trong đó **Doctor Matching + Real-time Dispatch dựa trên vị trí địa lý** là nội dung nghiên cứu cốt lõi.

Mọi chức năng khác phải hỗ trợ cho mô hình này và không làm phạm vi đề tài vượt quá khả năng triển khai của nhóm sinh viên.