import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { api } from '../../services/api'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

const TABS = [
  { key: 'active', label: 'Đang xử lý' },
  { key: 'upcoming', label: 'Sắp tới' },
  { key: 'history', label: 'Lịch sử' },
  { key: 'all', label: 'Tất cả' },
] as const

type ScopeType = (typeof TABS)[number]['key']

export const DoctorBookingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [scope, setScope] = useState<ScopeType>('active')
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchText, setSearchText] = useState('')

  const fetchBookings = async (targetScope: ScopeType = scope) => {
    try {
      const data = await api.getBookings(targetScope)
      setBookings(Array.isArray(data) ? data : [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchBookings(scope)
  }, [scope])

  const handleTabChange = (newScope: ScopeType) => {
    setScope(newScope)
  }

  // Lọc theo từ khóa tìm kiếm (tên bệnh nhân hoặc mã ca)
  const filteredList = bookings.filter((b) => {
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    const name = (b.patient_name || b.patientName || '').toLowerCase()
    const code = (b.code || '').toLowerCase()
    return name.includes(q) || code.includes(q)
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return { label: 'Đang khám', bg: '#d1fae5', text: '#065f46' }
      case 'CONFIRMED':
        return { label: 'Đã xác nhận', bg: '#ccfbf1', text: Colors.primaryDark }
      case 'DISPATCHING':
      case 'OFFERED':
        return { label: 'Chờ nhận ca', bg: '#fef3c7', text: '#92400e' }
      case 'COMPLETED':
        return { label: 'Hoàn thành', bg: '#f1f5f9', text: '#334155' }
      case 'CANCELLED':
        return { label: 'Đã hủy', bg: '#ffe4e6', text: '#9f1239' }
      case 'EXPIRED':
        return { label: 'Hết hạn', bg: '#f3f4f6', text: '#6b7280' }
      default:
        return { label: status, bg: '#f1f5f9', text: '#475569' }
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lịch khám bệnh nhân</Text>
        <Text style={styles.headerSub}>Quản lý các ca khám và lịch hẹn trực tuyến/trực tiếp</Text>

        {/* Thanh tìm kiếm */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên bệnh nhân hoặc mã ca..."
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor={Colors.textLight}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Thanh tabs phân loại */}
        <View style={styles.tabsRow}>
          {TABS.map((tab) => {
            const isActive = scope === tab.key
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => handleTabChange(tab.key)}
              >
                <Text style={[styles.tabTxt, isActive && styles.tabTxtActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* Nội dung danh sách */}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              fetchBookings(scope)
            }}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Không có ca khám nào</Text>
            <Text style={styles.emptySub}>
              {scope === 'active'
                ? 'Hiện không có ca khám nào đang chờ xử lý hoặc đang diễn ra.'
                : scope === 'upcoming'
                ? 'Chưa có lịch hẹn tương lai nào được xác nhận.'
                : 'Chưa có dữ liệu ca khám phù hợp.'}
            </Text>
          </View>
        ) : (
          filteredList.map((item) => {
            const badge = getStatusBadge(item.status)
            const dateStr = item.scheduled_at || item.scheduledAt || item.created_at || item.createdAt
            const formattedDate = dateStr
              ? new Date(dateStr).toLocaleString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Chưa có giờ cụ thể'

            const isOnline = item.consultation_type === 'ONLINE' || item.consultationType === 'ONLINE'
            const feeVnd = item.fee
              ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.fee)
              : null

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() =>
                  navigation.navigate('BookingDetail', { bookingId: item.id })
                }
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.patientRow}>
                      <Text style={styles.patientName}>
                        {item.patient_name || item.patientName || `Bệnh nhân #${item.id}`}
                      </Text>
                    </View>
                    <Text style={styles.bookingCode}>
                      {item.code || `Mã ca #${item.id}`} · {item.type === 'ON_DEMAND' ? 'Khám ngay' : 'Đặt lịch'}
                    </Text>
                  </View>

                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeTxt, { color: badge.text }]}>
                      {badge.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.cardBody}>
                  <View style={styles.infoLine}>
                    <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.infoTxt}>{formattedDate}</Text>
                  </View>

                  <View style={styles.infoLine}>
                    <Ionicons
                      name={isOnline ? 'videocam-outline' : 'business-outline'}
                      size={14}
                      color={isOnline ? '#0284c7' : '#059669'}
                    />
                    <Text style={styles.infoTxt}>
                      {isOnline ? 'Tư vấn trực tuyến qua Video' : 'Khám trực tiếp tại phòng khám'}
                    </Text>
                  </View>

                  {item.symptoms && (
                    <View style={styles.infoLine}>
                      <Ionicons name="medkit-outline" size={14} color={Colors.textMuted} />
                      <Text style={styles.infoTxt} numberOfLines={1}>
                        Triệu chứng: {item.symptoms}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.feeCol}>
                    {feeVnd && <Text style={styles.feeTxt}>{feeVnd}</Text>}
                    {item.payment_status && (
                      <Text style={styles.paymentStatusTxt}>
                        {item.payment_status === 'SUCCESS' ? 'Đã thanh toán' : 'Chờ thanh toán'}
                      </Text>
                    )}
                  </View>

                  <View style={styles.actionBtn}>
                    <Text style={styles.actionBtnTxt}>
                      {['CONFIRMED', 'IN_PROGRESS'].includes(item.status) ? 'Vào khám' : 'Chi tiết'}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </View>
                </View>
              </TouchableOpacity>
            )
          })
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
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    padding: 0,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  tabBtnActive: {
    backgroundColor: Colors.primaryGhost,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  tabTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTxtActive: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    paddingBottom: 30,
  },
  emptyContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  patientName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  bookingCode: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  cardBody: {
    gap: 6,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoTxt: {
    fontSize: 12,
    color: Colors.text,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  feeCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feeTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  paymentStatusTxt: {
    fontSize: 11,
    color: '#059669',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.primaryGhost,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
})
