import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { api } from '../../services/api'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  DISPATCHING: { label: 'Đang tìm bác sĩ', color: '#d97706', bg: '#fef3c7' },
  PENDING: { label: 'Chờ xác nhận', color: '#b45309', bg: '#fef3c7' },
  CONFIRMED: { label: 'Đã nhận ca', color: '#0284c7', bg: '#e0f2fe' },
  IN_PROGRESS: { label: 'Đang khám', color: '#16a34a', bg: '#dcfce7' },
  COMPLETED: { label: 'Hoàn thành', color: '#475569', bg: '#f1f5f9' },
  CANCELLED: { label: 'Đã hủy', color: '#e11d48', bg: '#ffe4e6' },
}

export const BookingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'DONE'>('ALL')

  const fetchBookings = async () => {
    try {
      const data = await api.getBookings()
      setBookings(data || [])
    } catch (err: any) {
      console.warn('Load bookings error:', err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchBookings()
  }, [])

  const filtered = (Array.isArray(bookings) ? bookings : []).filter((b) => {
    if (filterTab === 'ACTIVE') {
      return ['DISPATCHING', 'PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(
        b.status
      )
    }
    if (filterTab === 'DONE') {
      return ['COMPLETED', 'CANCELLED'].includes(b.status)
    }
    return true
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Lịch hẹn & Ca khám</Text>
        <Text style={styles.subTitle}>Quản lý lịch sử và tiến độ ca khám</Text>
      </View>

      {/* Tabs Filter */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, filterTab === 'ALL' && styles.tabBtnActive]}
          onPress={() => setFilterTab('ALL')}
        >
          <Text
            style={[
              styles.tabText,
              filterTab === 'ALL' && styles.tabTextActive,
            ]}
          >
            Tất cả
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, filterTab === 'ACTIVE' && styles.tabBtnActive]}
          onPress={() => setFilterTab('ACTIVE')}
        >
          <Text
            style={[
              styles.tabText,
              filterTab === 'ACTIVE' && styles.tabTextActive,
            ]}
          >
            Đang diễn ra
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, filterTab === 'DONE' && styles.tabBtnActive]}
          onPress={() => setFilterTab('DONE')}
        >
          <Text
            style={[
              styles.tabText,
              filterTab === 'DONE' && styles.tabTextActive,
            ]}
          >
            Đã xong
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="calendar-clear-outline"
            size={50}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>Chưa có lịch khám nào</Text>
          <Text style={styles.emptySub}>
            Bạn có thể chọn &quot;Khám ngay&quot; hoặc chọn bác sĩ để đặt lịch.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                fetchBookings()
              }}
            />
          }
          renderItem={({ item }) => {
            const st = STATUS_MAP[item.status] || {
              label: item.status,
              color: Colors.text,
              bg: '#f1f5f9',
            }

            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate('BookingDetail', { bookingId: item.id })
                }
              >
                <View style={styles.cardHeader}>
                  <View style={styles.bookingTypeBadge}>
                    <Ionicons
                      name={item.type === 'ON_DEMAND' ? 'flash' : 'calendar'}
                      size={12}
                      color={item.type === 'ON_DEMAND' ? '#f59e0b' : Colors.primary}
                    />
                    <Text style={styles.bookingTypeText}>
                      {item.type === 'ON_DEMAND' ? 'Khám ngay' : 'Đặt hẹn trước'}
                    </Text>
                  </View>

                  <View
                    style={[styles.statusBadge, { backgroundColor: st.bg }]}
                  >
                    <Text style={[styles.statusText, { color: st.color }]}>
                      {st.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.avatarBox}>
                    <Text style={styles.avatarText}>
                      {(item.doctor?.fullName || item.doctorName || item.doctor_name || 'BS')
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorName}>
                      {item.doctor?.fullName ||
                        item.doctorName ||
                        item.doctor_name ||
                        'Bác sĩ đang ghép nối...'}
                    </Text>
                    <Text style={styles.specialtyName}>
                      {item.specialty_name || item.specialtyName || item.specialty?.name || 'Đa khoa'}
                    </Text>
                    <Text style={styles.timeText}>
                      {new Date(
                        item.scheduled_at ||
                        item.scheduledAt ||
                        item.created_at ||
                        item.createdAt ||
                        Date.now()
                      ).toLocaleString('vi-VN')}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.codeText}>Mã ca: #{item.id}</Text>
                  <View style={styles.viewDetailRow}>
                    <Text style={styles.viewDetailText}>Chi tiết</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={Colors.primary}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  subTitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: Colors.primaryLight,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primaryDark,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  bookingTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bookingTypeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryGhost,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  doctorName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  specialtyName: {
    fontSize: 12,
    color: Colors.primary,
    marginTop: 1,
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  codeText: {
    fontSize: 11,
    color: Colors.textLight,
  },
  viewDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewDetailText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
})
