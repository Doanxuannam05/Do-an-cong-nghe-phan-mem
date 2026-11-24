import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { api } from '../../services/api'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const DoctorDetailScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { doctorId } = route.params
  const [doctor, setDoctor] = useState<any | null>(null)
  const [slots, setSlots] = useState<any[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookingLoading, setBookingLoading] = useState(false)

  useEffect(() => {
    async function fetchDoc() {
      try {
        const [d, s] = await Promise.all([
          api.getDoctorDetail(doctorId),
          api.getDoctorSlots(doctorId).catch(() => []),
        ])
        setDoctor(d)
        setSlots(s || [])
      } catch (err: any) {
        Alert.alert('Lỗi', err.message || 'Không thể tải thông tin bác sĩ')
      } finally {
        setLoading(false)
      }
    }
    fetchDoc()
  }, [doctorId])

  const handleBookSlot = async () => {
    if (!selectedSlotId) {
      Alert.alert('Thông báo', 'Vui lòng chọn một khung giờ khám còn trống')
      return
    }

    setBookingLoading(true)
    try {
      const res = await api.createScheduled({
        doctorId,
        slotId: selectedSlotId,
        consultationType: 'ONLINE',
      })
      Alert.alert('Thành công', 'Đặt lịch hẹn thành công!', [
        {
          text: 'Xem chi tiết',
          onPress: () =>
            navigation.navigate('BookingDetail', {
              bookingId: res.bookingId || res.id,
            }),
        },
      ])
    } catch (err: any) {
      Alert.alert('Đặt lịch thất bại', err.message || 'Khung giờ này có thể đã được đặt')
    } finally {
      setBookingLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    )
  }

  if (!doctor) {
    return (
      <View style={styles.centerContainer}>
        <Text style={{ color: Colors.textMuted }}>Không tìm thấy thông tin bác sĩ</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.navHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Hồ sơ Bác sĩ</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarTxt}>
              {(doctor.fullName || 'BS').slice(0, 2).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.docName}>{doctor.fullName}</Text>
          <Text style={styles.docSpec}>
            {doctor.specialtyName || doctor.specialty?.name || 'Đa khoa'}
          </Text>
          <Text style={styles.docClinic}>
            {doctor.clinicName || 'Bệnh viện Đa khoa Đà Nẵng'}
          </Text>

          {/* Metrics */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {doctor.ratingAvg ? Number(doctor.ratingAvg).toFixed(1) : '5.0'}★
              </Text>
              <Text style={styles.statLabel}>Đánh giá</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {doctor.experienceYears || 5} năm
              </Text>
              <Text style={styles.statLabel}>Kinh nghiệm</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {doctor.consultationFee
                  ? `${(Number(doctor.consultationFee) / 1000).toFixed(0)}k`
                  : 'Free'}
              </Text>
              <Text style={styles.statLabel}>Phí khám</Text>
            </View>
          </View>
        </View>

        {/* Thông tin CCHN & Giới thiệu */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Thông tin chuyên môn</Text>
          <View style={styles.infoRow}>
            <Ionicons name="ribbon-outline" size={18} color={Colors.primary} />
            <Text style={styles.infoText}>
              Số CCHN:{' '}
              <Text style={{ fontWeight: '700' }}>
                {doctor.licenseNumber || '012345/DNA-CCHN'}
              </Text>
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={Colors.primary} />
            <Text style={styles.infoText}>
              {doctor.address || 'Hải Châu, Đà Nẵng'}
            </Text>
          </View>
          <Text style={styles.bioText}>
            {doctor.bio ||
              'Bác sĩ có nhiều năm kinh nghiệm khám và tư vấn điều trị, luôn tận tâm chu đáo với người bệnh.'}
          </Text>
        </View>

        {/* Khung giờ khám (Slots) */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Đặt lịch khám theo khung giờ</Text>
          {slots.length === 0 ? (
            <Text style={styles.noSlotText}>
              Hiện chưa có khung giờ trống nào trong tuần này.
            </Text>
          ) : (
            <View style={styles.slotsGrid}>
              {slots.map((slot) => {
                const isSelected = selectedSlotId === slot.id
                return (
                  <TouchableOpacity
                    key={slot.id}
                    style={[
                      styles.slotBtn,
                      isSelected && styles.slotBtnSelected,
                      slot.isBooked && styles.slotBtnBooked,
                    ]}
                    disabled={slot.isBooked}
                    onPress={() => setSelectedSlotId(slot.id)}
                  >
                    <Text
                      style={[
                        styles.slotTime,
                        isSelected && styles.slotTimeSelected,
                        slot.isBooked && styles.slotTimeBooked,
                      ]}
                    >
                      {slot.startTime || slot.time}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer Bottom Bar */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.barLabel}>Phí tư vấn</Text>
          <Text style={styles.barPrice}>
            {doctor.consultationFee
              ? `${Number(doctor.consultationFee).toLocaleString('vi-VN')} đ`
              : 'Miễn phí'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.bookBtn, bookingLoading && { opacity: 0.7 }]}
          onPress={handleBookSlot}
          disabled={bookingLoading}
        >
          {bookingLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.bookBtnText}>Xác nhận đặt lịch</Text>
          )}
        </TouchableOpacity>
      </View>
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
  content: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 100,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  navTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarTxt: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  docName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  docSpec: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  docClinic: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: Colors.text,
  },
  bioText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: 6,
  },
  noSlotText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  slotBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  slotBtnBooked: {
    backgroundColor: '#f1f5f9',
    opacity: 0.5,
  },
  slotTime: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  slotTimeSelected: {
    color: '#fff',
  },
  slotTimeBooked: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    elevation: 8,
  },
  barLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  barPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primary,
  },
  bookBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  bookBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
})
