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

const DOW_NAMES: Record<number, string> = {
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
  0: 'Chủ nhật',
}

export const DoctorScheduleScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [scheduleItems, setScheduleItems] = useState<any[]>([])
  const [slots, setSlots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'slots' | 'shifts'>('slots')

  const fetchData = async () => {
    try {
      const [schedRes, slotsRes] = await Promise.allSettled([
        api.getDoctorSchedule(),
        api.getDoctorMySlots(7),
      ])

      if (schedRes.status === 'fulfilled' && Array.isArray(schedRes.value)) {
        setScheduleItems(schedRes.value)
      }
      if (slotsRes.status === 'fulfilled' && Array.isArray(slotsRes.value)) {
        setSlots(slotsRes.value)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Gom nhóm slots theo ngày
  const groupedSlots = slots.reduce((acc: Record<string, any[]>, slot: any) => {
    if (!slot.start_at) return acc
    const dateKey = slot.start_at.split('T')[0]
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(slot)
    return acc
  }, {})

  const sortedDates = Object.keys(groupedSlots).sort()

  const formatSlotTime = (isoString: string) => {
    if (!isoString) return ''
    return new Date(isoString).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatHeaderDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const dow = DOW_NAMES[d.getDay()] || ''
    const day = d.getDate().toString().padStart(2, '0')
    const month = (d.getMonth() + 1).toString().padStart(2, '0')
    const today = new Date().toISOString().split('T')[0]
    const isToday = dateStr === today
    return `${dow}, ${day}/${month} ${isToday ? '(Hôm nay)' : ''}`
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lịch làm việc & Ca trực</Text>
        <Text style={styles.headerSub}>
          Theo dõi khung giờ làm việc và các slot khám trong 7 ngày tới
        </Text>

        {/* Tab switch */}
        <View style={styles.tabSwitch}>
          <TouchableOpacity
            style={[styles.tabBtn, selectedTab === 'slots' && styles.tabBtnActive]}
            onPress={() => setSelectedTab('slots')}
          >
            <Ionicons
              name="calendar"
              size={15}
              color={selectedTab === 'slots' ? Colors.primaryDark : Colors.textMuted}
            />
            <Text
              style={[
                styles.tabBtnTxt,
                selectedTab === 'slots' && styles.tabBtnTxtActive,
              ]}
            >
              Slot 7 ngày tới ({slots.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, selectedTab === 'shifts' && styles.tabBtnActive]}
            onPress={() => setSelectedTab('shifts')}
          >
            <Ionicons
              name="time"
              size={15}
              color={selectedTab === 'shifts' ? Colors.primaryDark : Colors.textMuted}
            />
            <Text
              style={[
                styles.tabBtnTxt,
                selectedTab === 'shifts' && styles.tabBtnTxtActive,
              ]}
            >
              Ca trực cố định
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              fetchData()
            }}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : selectedTab === 'slots' ? (
          /* Danh sách slot theo ngày */
          sortedDates.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Chưa có slot khám nào</Text>
              <Text style={styles.emptySub}>
                Hệ thống chưa tạo slot khám tự động trong 7 ngày tới. Bạn có thể kiểm tra lại cấu hình ca trực cố định.
              </Text>
            </View>
          ) : (
            sortedDates.map((dateStr) => {
              const daySlots = groupedSlots[dateStr] || []
              const bookedCount = daySlots.filter((s) => s.status === 'BOOKED').length

              return (
                <View key={dateStr} style={styles.dateSection}>
                  <View style={styles.dateHeader}>
                    <Text style={styles.dateTitle}>{formatHeaderDate(dateStr)}</Text>
                    <Text style={styles.dateBadge}>
                      {bookedCount > 0 ? `${bookedCount} ca đã đặt` : 'Còn trống'}
                    </Text>
                  </View>

                  <View style={styles.slotsGrid}>
                    {daySlots.map((slot) => {
                      const isBooked = slot.status === 'BOOKED'
                      const isBlocked = slot.status === 'BLOCKED'

                      return (
                        <TouchableOpacity
                          key={slot.id}
                          style={[
                            styles.slotCard,
                            isBooked
                              ? styles.slotBooked
                              : isBlocked
                              ? styles.slotBlocked
                              : styles.slotAvailable,
                          ]}
                          disabled={!slot.booking_id}
                          onPress={() => {
                            if (slot.booking_id) {
                              navigation.navigate('BookingDetail', {
                                bookingId: slot.booking_id,
                              })
                            }
                          }}
                        >
                          <View style={styles.slotTimeRow}>
                            <Text
                              style={[
                                styles.slotTimeTxt,
                                isBooked && { color: Colors.primaryDark },
                              ]}
                            >
                              {formatSlotTime(slot.start_at)}
                            </Text>
                            <View
                              style={[
                                styles.slotDot,
                                {
                                  backgroundColor: isBooked
                                    ? '#10b981'
                                    : isBlocked
                                    ? '#ef4444'
                                    : '#94a3b8',
                                },
                              ]}
                            />
                          </View>

                          <Text
                            style={[
                              styles.slotStatusTxt,
                              isBooked && { color: '#065f46', fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                          >
                            {isBooked
                              ? slot.patient_name || 'Bệnh nhân đã đặt'
                              : isBlocked
                              ? 'Đã khóa'
                              : 'Trống'}
                          </Text>

                          {isBooked && (
                            <Text style={styles.viewDetailHint}>Xem ca khám ›</Text>
                          )}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )
            })
          )
        ) : (
          /* Cấu hình ca trực cố định trong tuần */
          <View style={styles.shiftsContainer}>
            <View style={styles.shiftIntroCard}>
              <Ionicons name="information-circle" size={20} color={Colors.primary} />
              <Text style={styles.shiftIntroTxt}>
                Lịch làm việc cố định giúp hệ thống tự động phân bổ các slot khám 30 phút cho bệnh nhân đặt lịch hẹn trực tuyến.
              </Text>
            </View>

            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const dowShifts = scheduleItems.filter((x) => x.dayOfWeek === dow)

              return (
                <View key={dow} style={styles.dowCard}>
                  <View style={styles.dowHeader}>
                    <Text style={styles.dowName}>{DOW_NAMES[dow]}</Text>
                    <Text
                      style={[
                        styles.dowStatus,
                        dowShifts.length > 0 ? styles.dowActive : styles.dowOff,
                      ]}
                    >
                      {dowShifts.length > 0
                        ? `${dowShifts.length} khung giờ`
                        : 'Nghỉ trực'}
                    </Text>
                  </View>

                  {dowShifts.length > 0 ? (
                    <View style={styles.shiftsList}>
                      {dowShifts.map((s, idx) => (
                        <View key={idx} style={styles.shiftRow}>
                          <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                          <Text style={styles.shiftTime}>
                            {s.startTime} - {s.endTime} ({s.slotMinutes || 30} phút/ca)
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noShiftTxt}>Không có ca trực vào ngày này.</Text>
                  )}
                </View>
              )
            })}
          </View>
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
  tabSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabBtnTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabBtnTxtActive: {
    fontWeight: '700',
    color: Colors.primaryDark,
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
  dateSection: {
    marginBottom: 16,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  dateBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotCard: {
    width: '31.3%',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
  },
  slotAvailable: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
  },
  slotBooked: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  slotBlocked: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    opacity: 0.6,
  },
  slotTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  slotTimeTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  slotDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  slotStatusTxt: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  viewDetailHint: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
    marginTop: 4,
  },
  shiftsContainer: {
    gap: 10,
  },
  shiftIntroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryGhost,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    padding: 12,
    gap: 10,
    marginBottom: 4,
  },
  shiftIntroTxt: {
    flex: 1,
    fontSize: 12,
    color: Colors.primaryDark,
    lineHeight: 16,
  },
  dowCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dowName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  dowStatus: {
    fontSize: 11,
    fontWeight: '700',
  },
  dowActive: {
    color: Colors.primaryDark,
  },
  dowOff: {
    color: Colors.textLight,
  },
  shiftsList: {
    gap: 4,
    marginTop: 4,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftTime: {
    fontSize: 12,
    color: Colors.text,
  },
  noShiftTxt: {
    fontSize: 11,
    color: Colors.textLight,
    fontStyle: 'italic',
    marginTop: 2,
  },
})
