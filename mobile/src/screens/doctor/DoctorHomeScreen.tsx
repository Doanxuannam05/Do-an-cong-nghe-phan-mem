import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const DoctorHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth()
  const [profile, setProfile] = useState<any | null>(null)
  const [stats, setStats] = useState<any | null>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [locating, setLocating] = useState(false)
  const [now, setNow] = useState(Date.now())

  // Đồng hồ đếm ngược mỗi giây cho các offer khám ngay
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const loadData = async () => {
    try {
      const [meRes, statsRes, reqsRes] = await Promise.allSettled([
        api.getDoctorMe(),
        api.getDoctorStats(),
        api.getDoctorRequests(),
      ])

      if (meRes.status === 'fulfilled' && meRes.value) {
        setProfile(meRes.value)
      }
      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setStats(statsRes.value)
      }
      if (reqsRes.status === 'fulfilled' && Array.isArray(reqsRes.value)) {
        setRequests(reqsRes.value)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 5000)
    return () => clearInterval(timer)
  }, [])

  const isOnline = profile?.status === 'ONLINE' || profile?.status === 'BUSY'
  const isAvailable = profile?.availability === 'AVAILABLE'

  const toggleOnline = async () => {
    if (updatingStatus) return
    setUpdatingStatus(true)
    const nextStatus = isOnline ? 'OFFLINE' : 'ONLINE'
    try {
      const res = await api.updateDoctorStatus({
        status: nextStatus,
        availability: nextStatus === 'ONLINE' ? 'AVAILABLE' : 'UNAVAILABLE',
      })
      setProfile((prev: any) => ({ ...prev, ...res }))
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể đổi trạng thái hoạt động')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const toggleAvailability = async (value: boolean) => {
    if (updatingStatus || !isOnline) return
    setUpdatingStatus(true)
    try {
      const res = await api.updateDoctorStatus({
        availability: value ? 'AVAILABLE' : 'UNAVAILABLE',
      })
      setProfile((prev: any) => ({ ...prev, ...res }))
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể cập nhật trạng thái nhận ca')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleShareLocation = async () => {
    setLocating(true)
    try {
      // Vị trí mẫu trung tâm Đà Nẵng
      const lat = 16.0544 + (Math.random() - 0.5) * 0.02
      const lng = 108.2022 + (Math.random() - 0.5) * 0.02
      await api.updateDoctorLocation({ lat, lng })
      setProfile((prev: any) => ({
        ...prev,
        latitude: lat,
        longitude: lng,
        locationUpdatedAt: new Date().toISOString(),
      }))
      Alert.alert('Thành công', 'Đã cập nhật vị trí GPS của bạn trên bản đồ điều phối.')
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể cập nhật vị trí')
    } finally {
      setLocating(false)
    }
  }

  const handleAcceptRequest = async (bookingId: number) => {
    try {
      await api.acceptBooking(bookingId)
      await loadData()
      navigation.navigate('BookingDetail', { bookingId })
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể nhận ca khám')
      loadData()
    }
  }

  const handleRejectRequest = async (bookingId: number) => {
    try {
      await api.rejectBooking(bookingId, 'Bác sĩ bận')
      await loadData()
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể từ chối ca')
    }
  }

  const doctorName = profile?.fullName || user?.fullName || 'Bác sĩ'
  const specialtyName =
    profile?.specialty?.name ||
    profile?.specialties?.[0]?.name ||
    (user as any)?.specialty ||
    'Bác sĩ Đa khoa'
  const verification = profile?.verificationStatus || user?.verificationStatus

  // Lọc lịch hôm nay
  const todayList = stats?.today || []
  const completedCount = stats?.byStatus?.COMPLETED || 0
  const acceptanceRate =
    stats?.acceptanceRate != null ? `${Math.round(stats.acceptanceRate * 100)}%` : '100%'
  const ratingScore = profile?.rating || stats?.rating ? `${(profile?.rating || stats?.rating).toFixed(1)} ★` : '5.0 ★'
  const revenueMonth = stats?.revenueMonth
    ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stats.revenueMonth)
    : '0 đ'

  return (
    <View style={styles.container}>
      {/* Header bác sĩ */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarTxt}>
              {doctorName.split(' ').pop()?.[0]?.toUpperCase() || 'B'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.docName} numberOfLines={1}>
                BS. {doctorName}
              </Text>
              {verification === 'APPROVED' && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#059669" />
                  <Text style={styles.verifiedTxt}>Đã duyệt</Text>
                </View>
              )}
            </View>
            <Text style={styles.specialtyTxt}>{specialtyName}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshIconBtn}
          onPress={() => {
            setRefreshing(true)
            loadData()
          }}
        >
          <Ionicons name="reload-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              loadData()
            }}
          />
        }
      >
        {/* Banner cảnh báo hồ sơ nếu chưa duyệt */}
        {verification && verification !== 'APPROVED' && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle" size={18} color="#b45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Hồ sơ đang chờ phê duyệt</Text>
              <Text style={styles.warningSub}>
                Bạn sẽ xuất hiện trên bản đồ tìm kiếm và điều phối ca ngay sau khi Admin duyệt hồ sơ.
              </Text>
            </View>
          </View>
        )}

        {/* Thẻ Trạng thái Online / Sẵn sàng nhận ca */}
        <View style={styles.statusCard}>
          <View style={styles.statusTopRow}>
            <TouchableOpacity
              style={[
                styles.powerBtn,
                isOnline ? styles.powerBtnActive : styles.powerBtnInactive,
              ]}
              disabled={updatingStatus}
              onPress={toggleOnline}
            >
              <Ionicons
                name="power"
                size={24}
                color={isOnline ? '#fff' : Colors.textMuted}
              />
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <View style={styles.statusStateRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isOnline ? '#10b981' : '#94a3b8' },
                  ]}
                />
                <Text style={styles.statusStateText}>
                  {profile?.status === 'BUSY'
                    ? 'Đang có ca khám'
                    : isOnline
                    ? 'Đang Trực Tuyến (Online)'
                    : 'Ngoại Tuyến (Offline)'}
                </Text>
              </View>
              <Text style={styles.statusHint}>
                {isOnline
                  ? 'Chạm nút nguồn để chuyển sang nghỉ'
                  : 'Bật online để bắt đầu nhận bệnh nhân'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Sẵn sàng nhận điều phối ca ngay */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.toggleLabel}>Sẵn sàng nhận bệnh khẩn cấp</Text>
              <Text style={styles.toggleDesc}>
                {!isOnline
                  ? 'Cần bật Online trước để nhận ca'
                  : isAvailable
                  ? 'Hệ thống tự động điều phối bệnh nhân lân cận tới bạn'
                  : 'Tạm ngừng nhận ca cấp cứu / khám ngay'}
              </Text>
            </View>
            <Switch
              value={isOnline && isAvailable}
              disabled={!isOnline || updatingStatus}
              onValueChange={toggleAvailability}
              trackColor={{ false: '#cbd5e1', true: Colors.primary }}
            />
          </View>

          <View style={styles.divider} />

          {/* Chia sẻ GPS */}
          <View style={styles.locationRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationLabel}>Vị trí điều phối GPS</Text>
              <Text style={styles.locationDesc} numberOfLines={1}>
                {profile?.latitude != null && profile?.longitude != null
                  ? `${profile.latitude.toFixed(4)}, ${profile.longitude.toFixed(4)} (Đà Nẵng)`
                  : 'Chưa cập nhật tọa độ'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.gpsBtn}
              disabled={locating}
              onPress={handleShareLocation}
            >
              {locating ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="navigate" size={14} color={Colors.primary} />
                  <Text style={styles.gpsBtnTxt}>Cập nhật vị trí</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Lời mời nhận ca đến (Incoming Offers - Có đếm ngược 30s) */}
        {requests.length > 0 && (
          <View style={styles.requestsSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.alertIconBadge}>
                <Ionicons name="notifications" size={16} color="#d97706" />
              </View>
              <Text style={styles.requestSectionTitle}>
                YÊU CẦU ĐIỀU PHỐI ĐẾN ({requests.length})
              </Text>
            </View>

            {requests.map((offer) => {
              const expireTime = offer.expiresAt ? new Date(offer.expiresAt).getTime() : 0
              const remainingSec = Math.max(0, Math.ceil((expireTime - now) / 1000))

              return (
                <View key={offer.offerId || offer.bookingId} style={styles.offerCard}>
                  <View style={styles.offerHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.offerPatientName}>
                        {offer.patientName || 'Bệnh nhân cần khám ngay'}
                      </Text>
                      <Text style={styles.offerMeta}>
                        {offer.type === 'ON_DEMAND' ? 'Khám ngay' : 'Đặt lịch'} ·{' '}
                        {offer.consultationType === 'IN_PERSON'
                          ? 'Tại nhà/Phòng khám'
                          : 'Tư vấn Video'}
                        {offer.distanceKm != null ? ` · Cách ${offer.distanceKm.toFixed(1)} km` : ''}
                      </Text>
                    </View>

                    <View style={styles.timerBadge}>
                      <Ionicons name="time-outline" size={13} color="#b45309" />
                      <Text style={styles.timerTxt}>{remainingSec}s</Text>
                    </View>
                  </View>

                  {offer.symptoms && (
                    <View style={styles.symptomsBox}>
                      <Text style={styles.symptomsLabel}>Triệu chứng:</Text>
                      <Text style={styles.symptomsTxt} numberOfLines={2}>
                        {offer.symptoms}
                      </Text>
                    </View>
                  )}

                  <View style={styles.offerActions}>
                    <TouchableOpacity
                      style={styles.rejectOfferBtn}
                      onPress={() => handleRejectRequest(offer.bookingId)}
                    >
                      <Text style={styles.rejectOfferTxt}>Từ chối</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.acceptOfferBtn}
                      onPress={() => handleAcceptRequest(offer.bookingId)}
                    >
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.acceptOfferTxt}>Nhận ca</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {/* Chỉ số nhanh (KPI Stats) */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Ca hoàn thành</Text>
            <Text style={styles.statNumber}>{completedCount}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Tỷ lệ nhận ca</Text>
            <Text style={styles.statNumber}>{acceptanceRate}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Đánh giá</Text>
            <Text style={styles.statNumber}>{ratingScore}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Doanh thu tháng</Text>
            <Text style={[styles.statNumber, { fontSize: 14, color: Colors.primaryDark }]}>
              {revenueMonth}
            </Text>
          </View>
        </View>

        {/* Lịch khám hôm nay */}
        <View style={styles.todaySection}>
          <View style={styles.todayHeader}>
            <Text style={styles.sectionTitle}>Lịch hẹn hôm nay ({todayList.length})</Text>
            <TouchableOpacity onPress={() => navigation.navigate('DoctorBookingsTab')}>
              <Text style={styles.seeAllTxt}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
          ) : todayList.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Chưa có ca khám hôm nay</Text>
              <Text style={styles.emptySub}>
                Các ca đặt lịch trong ngày sẽ xuất hiện tại đây khi bệnh nhân xác nhận.
              </Text>
            </View>
          ) : (
            todayList.map((item: any) => {
              const timeStr = item.scheduled_at
                ? new Date(item.scheduled_at).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Trong ngày'

              const isInProgress = item.status === 'IN_PROGRESS'

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.todayCard,
                    isInProgress && { borderColor: Colors.primary, borderWidth: 1.5 },
                  ]}
                  onPress={() =>
                    navigation.navigate('BookingDetail', { bookingId: item.id })
                  }
                >
                  <View style={styles.timeCol}>
                    <Text style={styles.timeTxt}>{timeStr}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: isInProgress
                            ? '#d1fae5'
                            : item.status === 'CONFIRMED'
                            ? '#ccfbf1'
                            : '#f1f5f9',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillTxt,
                          {
                            color: isInProgress
                              ? '#065f46'
                              : item.status === 'CONFIRMED'
                              ? Colors.primaryDark
                              : Colors.textMuted,
                          },
                        ]}
                      >
                        {isInProgress
                          ? 'Đang khám'
                          : item.status === 'CONFIRMED'
                          ? 'Đã duyệt'
                          : item.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.patientInfoCol}>
                    <Text style={styles.patientNameTxt} numberOfLines={1}>
                      {item.patient_name || 'Bệnh nhân'}
                    </Text>
                    <Text style={styles.consultTypeTxt} numberOfLines={1}>
                      {item.consultation_type === 'IN_PERSON'
                        ? 'Khám tại chỗ'
                        : 'Khám trực tuyến qua Video'}
                      {item.symptoms ? ` · ${item.symptoms}` : ''}
                    </Text>
                  </View>

                  <View style={styles.actionCol}>
                    <View style={styles.enterBtn}>
                      <Text style={styles.enterBtnTxt}>Vào khám</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={Colors.primary}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })
          )}
        </View>

        {/* Phím tắt quản lý ca trực */}
        <View style={styles.quickAccessSection}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => navigation.navigate('DoctorScheduleTab')}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="time" size={20} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickTitle}>Lịch trực & Khung giờ làm</Text>
              <Text style={styles.quickSub}>Cài đặt giờ nhận khám Thứ 2 đến Chủ nhật</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => navigation.navigate('DoctorBookingsTab')}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="folder-open" size={20} color="#16a34a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickTitle}>Hồ sơ ca khám & Lịch sử</Text>
              <Text style={styles.quickSub}>Xem danh sách ca khám theo từng giai đoạn</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryGhost,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  docName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    maxWidth: 180,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#a7f3d0',
  },
  verifiedTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  specialtyTxt: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  refreshIconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  warningBanner: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  warningSub: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 2,
    lineHeight: 16,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  powerBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerBtnActive: {
    backgroundColor: Colors.primary,
  },
  powerBtnInactive: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  statusStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  statusStateText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  statusHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  toggleDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  locationLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  locationDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryGhost,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  gpsBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  requestsSection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  alertIconBadge: {
    backgroundColor: '#fef3c7',
    padding: 4,
    borderRadius: 6,
  },
  requestSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#d97706',
  },
  offerCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 14,
    marginBottom: 8,
  },
  offerHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  offerPatientName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  offerMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  timerTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b45309',
  },
  symptomsBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  symptomsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  symptomsTxt: {
    fontSize: 12,
    color: Colors.text,
    marginTop: 2,
  },
  offerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  rejectOfferBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectOfferTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  acceptOfferBtn: {
    flex: 2,
    backgroundColor: '#059669',
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  acceptOfferTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 4,
  },
  todaySection: {
    marginBottom: 16,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  seeAllTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  todayCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  timeCol: {
    width: 68,
    alignItems: 'center',
  },
  timeTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  statusPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
  },
  statusPillTxt: {
    fontSize: 10,
    fontWeight: '700',
  },
  patientInfoCol: {
    flex: 1,
  },
  patientNameTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  consultTypeTxt: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  actionCol: {
    alignItems: 'flex-end',
  },
  enterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.primaryGhost,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  enterBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  quickAccessSection: {
    gap: 8,
  },
  quickActionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  quickSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
})
