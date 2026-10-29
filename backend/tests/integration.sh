#!/usr/bin/env bash
# Integration test (cần backend đang chạy): Patient → Booking → Matching → Doctor → Accept → Consultation → Payment → Review
# Chạy: bash backend/tests/integration.sh
set -euo pipefail
B=${API:-http://localhost:3001/api}
j() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);const p=process.argv[1].split(".");let x=v;for(const k of p)x=x?.[k];console.log(x??"")})' "$1"; }
login() { curl -sf -X POST $B/auth/login -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"Demo@123\"}" | j accessToken; }
ok() { echo "  ✔ $1"; }
fail() { echo "  ✘ $1"; exit 1; }

echo "1. Đăng nhập 3 vai trò"
PT=$(login patient@demo.vn); DT=$(login doctor@demo.vn); AT=$(login admin@demo.vn)
[ -n "$PT" ] && [ -n "$DT" ] && [ -n "$AT" ] && ok "JWT cấp thành công"

echo "2. RBAC"
code=$(curl -s -o /dev/null -w '%{http_code}' $B/admin/stats -H "authorization: Bearer $PT"); [ "$code" = 403 ] && ok "Patient bị chặn API admin (403)" || fail "RBAC $code"
code=$(curl -s -o /dev/null -w '%{http_code}' $B/admin/stats); [ "$code" = 401 ] && ok "Không token → 401" || fail "auth $code"

echo "3. Tìm bác sĩ gần (Tai Mũi Họng, 3 km)"
n=$(curl -sf "$B/doctors/nearby?lat=16.0681&lng=108.2189&radius=3&specialtyId=$(curl -sf $B/specialties | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(x=>x.slug==="tai-mui-hong").id))')" | j total)
[ "$n" -gt 0 ] && ok "$n bác sĩ trong bán kính"

SPEC=$(curl -sf $B/specialties | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(x=>x.slug==="tai-mui-hong").id))')
echo "4. Gửi yêu cầu khám ngay → Matching → Dispatch"
# Bác sĩ demo mở ứng dụng (kết nối real-time) → được tính là đang trực tuyến
curl -sN "$B/stream?token=$DT" >/dev/null 2>&1 & SSE=$!
trap 'kill $SSE 2>/dev/null' EXIT
sleep 1
R=$(curl -sf -X POST $B/bookings/on-demand -H "authorization: Bearer $PT" -H 'content-type: application/json' -d "{\"specialtyId\":$SPEC,\"consultationType\":\"ONLINE\",\"lat\":16.0681,\"lng\":108.2189,\"radiusKm\":3}")
ID=$(echo "$R" | j id); ST=$(echo "$R" | j status)
[ "$ST" = OFFERED ] && ok "Booking $ID → OFFERED (đã mời bác sĩ #1)" || fail "status $ST"

echo "5. Bác sĩ demo nhận ca"
curl -sf -X POST $B/bookings/$ID/accept -H "authorization: Bearer $DT" >/dev/null && ok "ACCEPTED → CONFIRMED" || echo "  (bác sĩ demo không phải ứng viên #1 – bỏ qua)"

echo "5b. Chat & thông báo (PostgreSQL)"
CONV=$(curl -sf $B/bookings/$ID -H "authorization: Bearer $PT" | j conversationId)
[ "$CONV" = "$ID" ] && ok "Phòng chat id = booking $ID"
curl -sf -X POST $B/conversations/$CONV/messages -H "authorization: Bearer $PT" -H 'content-type: application/json' -d '{"content":"Kiểm thử tin nhắn"}' >/dev/null && ok "Gửi tin nhắn"
n=$(curl -sf $B/conversations/$CONV/messages -H "authorization: Bearer $PT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).messages.filter(m=>m.content==="Kiểm thử tin nhắn").length))')
[ "$n" -ge 1 ] && ok "Đọc lại tin nhắn"
P2X=$(login bn020@sim.medigo.vn)
code=$(curl -s -o /dev/null -w '%{http_code}' $B/conversations/$CONV/messages -H "authorization: Bearer $P2X"); [ "$code" = 403 ] && ok "Người ngoài không đọc được phòng chat (403)" || fail "chat ACL $code"
u=$(curl -sf $B/notifications -H "authorization: Bearer $PT" | j unread); [ -n "$u" ] && ok "Thông báo: $u chưa đọc"

echo "6. State machine chặn chuyển sai"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/consultations/$ID/end -H "authorization: Bearer $DT" -H 'content-type: application/json' -d '{}')
[ "$code" = 409 ] && ok "CONFIRMED → COMPLETED bị từ chối (409)"

echo "7. Khám → hoàn thành → thanh toán → đánh giá"
curl -sf -X POST $B/consultations/$ID/start -H "authorization: Bearer $DT" >/dev/null && ok "IN_PROGRESS"
curl -sf -X POST $B/consultations/$ID/end -H "authorization: Bearer $DT" -H 'content-type: application/json' -d '{"notes":"Kiểm thử","advice":"Nghỉ ngơi"}' >/dev/null && ok "COMPLETED"
[ "$(curl -sf -X POST $B/payments -H "authorization: Bearer $PT" -H 'content-type: application/json' -d "{\"bookingId\":$ID,\"method\":\"MOCK_PAYMENT\"}" | j status)" = SUCCESS ] && ok "Thanh toán giả lập SUCCESS"
curl -sf -X POST $B/reviews -H "authorization: Bearer $PT" -H 'content-type: application/json' -d "{\"bookingId\":$ID,\"rating\":5}" >/dev/null && ok "Đánh giá 5★"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/reviews -H "authorization: Bearer $PT" -H 'content-type: application/json' -d "{\"bookingId\":$ID,\"rating\":4}")
[ "$code" = 409 ] && ok "Không cho đánh giá lần 2 (409)"

echo "8. Chống double booking (3 request đồng thời cùng 1 slot)"
DOC=$(curl -sf "$B/doctors?specialtyId=$SPEC&limit=5" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).items.find(d=>d.isSimulated).id))')
SLOT=$(curl -sf "$B/doctors/$DOC" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s).slots;console.log(x[x.length-1].id)})')
P2=$(login bn010@sim.medigo.vn); P3=$(login bn011@sim.medigo.vn)
codes=$(for t in $PT $P2 $P3; do curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/bookings -H "authorization: Bearer $t" -H 'content-type: application/json' -d "{\"doctorId\":$DOC,\"slotId\":$SLOT,\"consultationType\":\"ONLINE\"}" & done; wait)
wins=$(echo "$codes" | grep -c 201 || true)
[ "$wins" = 1 ] && ok "Chỉ 1/3 request đặt được slot ($(echo $codes | tr '\n' ' '))" || fail "double booking: $codes"
echo "Hoàn tất."
