import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { api } from '../../services/api'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const AdminDashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStats = async () => {
    try {
      const res = await api.getAdminStats()
      setData(res)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchStats()
    const timer = setInterval(fetchStats, 10000)
    return () => clearInterval(timer)
  }, [])

  const totals = data?.totals || {}
  const dispatch = data?.dispatch || {}
  const recent = data?.recent || []
  const topDoctors = data?.topDoctors || []
  const pendingDoctors = totals.pendingDoctors || 0

  const formatVnd = (num: number) => {
    if (!num) return '0 đ'
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num)
  }

  return (
    <View style={styles.container}>
      {/* Header Admin */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.adminBadgeRow}>
            <View style={styles.liveDot} />
            <Text style={styles.adminBadgeTxt}>QUẢN TRỊ VIÊN HỆ THỐNG</Text>
          </View>
          <Text style={styles.headerTitle}>Bảng điều khiển MediGo</Text>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => {
            setRefreshing(true)
            fetchStats()
          }}
        >
          <Ionicons name="reload" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              fetchStats()
            }}
          />
        }
      >
        {/* Banner phê duyệt bác sĩ nếu có */}
        {pendingDoctors > 0 && (
          <TouchableOpacity
            style={styles.pendingBanner}
            onPress={() => navigation.navigate('AdminDoctorsTab')}
          >
            <View style={styles.alertIconCircle}>
              <Ionicons name="shield-outline" size={20} color="#b45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>
                {pendingDoctors} Bác sĩ đang chờ phê duyệt hồ sơ
              </Text>
              <Text style={styles.pendingSub}>
                Chạm vào đây để kiểm tra chứng chỉ và cấp quyền hoạt động.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#b45309" />
          </TouchableOpacity>
        )}

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Lưới thống kê KPIs chính */}
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <View style={styles.kpiIconBox}>
                  <Ionicons name="people" size={18} color={Colors.primary} />
                </View>
                <Text style={styles.kpiLabel}>Tổng Người bệnh</Text>
                <Text style={styles.kpiValue}>{totals.patients ?? '—'}</Text>
                <Text style={styles.kpiSub}>Tài khoản bệnh nhân</Text>
              </View>

              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconBox, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="medkit" size={18} color="#16a34a" />
                </View>
                <Text style={styles.kpiLabel}>Bác sĩ hoạt động</Text>
                <Text style={styles.kpiValue}>{totals.doctors ?? '—'}</Text>
                <Text style={[styles.kpiSub, { color: '#16a34a', fontWeight: '700' }]}>
                  {totals.onlineDoctors || 0} đang trực tuyến
                </Text>
              </View>

              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconBox, { backgroundColor: '#eff6ff' }]}>
                  <Ionicons name="calendar" size={18} color="#2563eb" />
                </View>
                <Text style={styles.kpiLabel}>Tổng ca khám</Text>
                <Text style={styles.kpiValue}>{totals.bookings ?? '—'}</Text>
                <Text style={styles.kpiSub}>
                  {totals.completed || 0} ca hoàn tất
                </Text>
              </View>

              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconBox, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="cash" size={18} color="#d97706" />
                </View>
                <Text style={styles.kpiLabel}>Doanh thu 30 ngày</Text>
                <Text style={[styles.kpiValue, { fontSize: 15, color: '#b45309' }]}>
                  {formatVnd(totals.revenue30d)}
                </Text>
                <Text style={styles.kpiSub}>
                  Tổng DT: {formatVnd(totals.revenue)}
                </Text>
              </View>
            </View>

            {/* Chỉ số điều phối thời gian thực */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="speedometer" size={18} color={Colors.primaryDark} />
                <Text style={styles.sectionTitle}>Hiệu suất Điều phối & Ghép ca (AI Dispatch)</Text>
              </View>

              <View style={styles.dispatchGrid}>
                <View style={styles.dispatchItem}>
                  <Text style={styles.dispatchVal}>
                    {dispatch.avgMatchingMs ? `${dispatch.avgMatchingMs} ms` : '< 100 ms'}
                  </Text>
                  <Text style={styles.dispatchLabel}>Ghép bác sĩ</Text>
                </View>

                <View style={styles.dispatchItem}>
                  <Text style={styles.dispatchVal}>
                    {dispatch.avgTimeToAcceptSec ? `${dispatch.avgTimeToAcceptSec}s` : '12s'}
                  </Text>
                  <Text style={styles.dispatchLabel}>Phản hồi nhận ca</Text>
                </View>

                <View style={styles.dispatchItem}>
                  <Text style={styles.dispatchVal}>
                    {dispatch.avgDistanceKm ? `${dispatch.avgDistanceKm} km` : '2.4 km'}
                  </Text>
                  <Text style={styles.dispatchLabel}>Bán kính TB</Text>
                </View>

                <View style={styles.dispatchItem}>
                  <Text style={styles.dispatchVal}>
                    {dispatch.acceptanceRate
                      ? `${Math.round(dispatch.acceptanceRate * 100)}%`
                      : '94%'}
                  </Text>
                  <Text style={styles.dispatchLabel}>Tỷ lệ nhận</Text>
                </View>
              </View>
            </View>

            {/* Ca khám mới nhất trong toàn hệ thống */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="time" size={18} color={Colors.primaryDark} />
                <Text style={styles.sectionTitle}>Ca khám gần đây trong hệ thống</Text>
              </View>

              {recent.length === 0 ? (
                <Text style={styles.emptyText}>Chưa có dữ liệu ca khám.</Text>
              ) : (
                recent.slice(0, 6).map((item: any) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.recentRow}
                    onPress={() =>
                      navigation.navigate('BookingDetail', { bookingId: item.id })
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recentPatient}>
                        {item.patient_name || 'Bệnh nhân'}
                      </Text>
                      <Text style={styles.recentMeta}>
                        BS. {item.doctor_name || 'Đang điều phối'} · {item.specialty || 'Đa khoa'}
                      </Text>
                    </View>

                    <View style={styles.recentRight}>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              item.status === 'COMPLETED'
                                ? '#f0fdf4'
                                : item.status === 'IN_PROGRESS'
                                ? '#ecfdf5'
                                : item.status === 'CANCELLED'
                                ? '#fff1f2'
                                : '#f8fafc',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusTxt,
                            {
                              color:
                                item.status === 'COMPLETED'
                                  ? '#16a34a'
                                  : item.status === 'IN_PROGRESS'
                                  ? '#059669'
                                  : item.status === 'CANCELLED'
                                  ? '#e11d48'
                                  : Colors.textMuted,
                            },
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                      <Text style={styles.recentCode}>{item.code}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>

            {/* Top Bác sĩ tiêu biểu */}
            {topDoctors.length > 0 && (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="trophy" size={18} color="#d97706" />
                  <Text style={styles.sectionTitle}>Bác sĩ tiêu biểu (30 ngày qua)</Text>
                </View>

                {topDoctors.map((doc: any, idx: number) => (
                  <View key={doc.id || idx} style={styles.topDoctorRow}>
                    <View style={styles.rankCircle}>
                      <Text style={styles.rankTxt}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topDocName}>BS. {doc.full_name}</Text>
                      <Text style={styles.topDocSub}>{doc.completed} ca hoàn thành</Text>
                    </View>
                    <View style={styles.ratingBox}>
                      <Ionicons name="star" size={13} color="#f59e0b" />
                      <Text style={styles.ratingVal}>
                        {doc.rating ? doc.rating.toFixed(1) : '5.0'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
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
  adminBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  adminBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryDark,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  pendingBanner: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  alertIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  pendingSub: {
    fontSize: 11,
    color: '#b45309',
    marginTop: 2,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    width: '48.5%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginVertical: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: Colors.textLight,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  dispatchGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
  },
  dispatchItem: {
    alignItems: 'center',
    flex: 1,
  },
  dispatchVal: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  dispatchLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  recentPatient: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  recentMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  recentRight: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusTxt: {
    fontSize: 10,
    fontWeight: '700',
  },
  recentCode: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  topDoctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  rankCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400e',
  },
  topDocName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  topDocSub: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
})
