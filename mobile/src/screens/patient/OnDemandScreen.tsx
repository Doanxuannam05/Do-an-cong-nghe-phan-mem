import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { api } from '../../services/api'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

const DEFAULT_LAT = 16.0544
const DEFAULT_LNG = 108.2022

export const OnDemandScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [specialties, setSpecialties] = useState<any[]>([])
  const [selectedSpecialty, setSelectedSpecialty] = useState<number | null>(null)
  const [consultationType, setConsultationType] = useState<'ONLINE' | 'IN_PERSON'>('ONLINE')
  const [radiusKm, setRadiusKm] = useState<number>(5)
  const [symptoms, setSymptoms] = useState('')
  const [address, setAddress] = useState('Hải Châu, Đà Nẵng')

  const [loading, setLoading] = useState(false)
  const [matchingState, setMatchingState] = useState<
    'IDLE' | 'MATCHING' | 'ACCEPTED' | 'FAILED'
  >('IDLE')
  const [countdown, setCountdown] = useState(30)
  const [activeBookingId, setActiveBookingId] = useState<number | null>(null)

  useEffect(() => {
    api.getSpecialties().then((specs) => {
      setSpecialties(specs || [])
      if (specs?.length) setSelectedSpecialty(specs[0].id)
    })
  }, [])

  // Timer đếm ngược 30s khi đang điều phối
  useEffect(() => {
    let timer: any = null
    if (matchingState === 'MATCHING' && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown((c) => c - 1)
      }, 1000)
    } else if (matchingState === 'MATCHING' && countdown === 0) {
      // Hết 30s kiểm tra lại hoặc chuyển trạng thái
      checkBookingStatus()
    }
    return () => clearTimeout(timer)
  }, [matchingState, countdown])

  // Polling trạng thái booking trong lúc matching
  useEffect(() => {
    let pollInterval: any = null
    if (matchingState === 'MATCHING' && activeBookingId) {
      pollInterval = setInterval(async () => {
        try {
          const detail = await api.getBookingDetail(activeBookingId)
          if (
            detail.status === 'CONFIRMED' ||
            detail.status === 'IN_PROGRESS' ||
            detail.status === 'ACCEPTED'
          ) {
            setMatchingState('ACCEPTED')
            clearInterval(pollInterval)
          } else if (detail.status === 'CANCELLED' || detail.status === 'FAILED') {
            setMatchingState('FAILED')
            clearInterval(pollInterval)
          }
        } catch {
          // ignore
        }
      }, 2500)
    }
    return () => clearInterval(pollInterval)
  }, [matchingState, activeBookingId])

  const checkBookingStatus = async () => {
    if (!activeBookingId) return
    try {
      const detail = await api.getBookingDetail(activeBookingId)
      if (detail.status === 'CONFIRMED' || detail.status === 'IN_PROGRESS') {
        setMatchingState('ACCEPTED')
      } else {
        // Tự động tìm tiếp hoặc hết bác sĩ
        setCountdown(30)
      }
    } catch {
      setMatchingState('FAILED')
    }
  }

  const handleStartOnDemand = async () => {
    if (!selectedSpecialty) {
      Alert.alert('Lỗi', 'Vui lòng chọn một chuyên khoa khám')
      return
    }

    setLoading(true)
    try {
      const res = await api.createOnDemand({
        specialtyId: selectedSpecialty,
        consultationType,
        lat: DEFAULT_LAT,
        lng: DEFAULT_LNG,
        address,
        symptoms: symptoms.trim() || undefined,
        radiusKm,
      })

      const bId = res.bookingId || res.id
      setActiveBookingId(bId)
      setMatchingState('MATCHING')
      setCountdown(30)
    } catch (err: any) {
      Alert.alert('Không thể tạo yêu cầu', err.message || 'Lỗi hệ thống')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelRequest = async () => {
    if (activeBookingId) {
      try {
        await api.cancelBooking(activeBookingId, 'Bệnh nhân chủ động hủy yêu cầu')
      } catch {
        // ignore
      }
    }
    setMatchingState('IDLE')
    setActiveBookingId(null)
  }

  // Màn hình Radar khi đang Dispatching (Matching)
  if (matchingState === 'MATCHING') {
    return (
      <View style={styles.matchingContainer}>
        <View style={styles.radarWrapper}>
          <View style={styles.radarRing3} />
          <View style={styles.radarRing2} />
          <View style={styles.radarRing1} />
          <View style={styles.radarCenter}>
            <Ionicons name="medical" size={36} color="#fff" />
          </View>
        </View>

        <Text style={styles.matchingTitle}>Đang tìm bác sĩ tối ưu...</Text>
        <Text style={styles.matchingSub}>
          Đang tính điểm Multi-Criteria (Khoảng cách, Chuyên khoa, Đánh giá, Kinh nghiệm)
        </Text>

        <View style={styles.countdownBadge}>
          <Ionicons name="time-outline" size={18} color={Colors.warning} />
          <Text style={styles.countdownText}>
            Phản hồi trong: <Text style={{ fontWeight: '800' }}>{countdown}s</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={styles.cancelMatchingBtn}
          onPress={handleCancelRequest}
        >
          <Text style={styles.cancelMatchingText}>Hủy tìm kiếm</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Màn hình khi Bác sĩ đã nhận ca
  if (matchingState === 'ACCEPTED') {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCircle}>
          <Ionicons name="checkmark-done" size={60} color="#fff" />
        </View>
        <Text style={styles.successTitle}>Bác sĩ đã chấp nhận ca khám!</Text>
        <Text style={styles.successSub}>
          Bác sĩ đã sẵn sàng tư vấn cho bạn. Bạn có thể bắt đầu chat hoặc gọi video.
        </Text>

        <TouchableOpacity
          style={styles.goToDetailBtn}
          onPress={() => {
            const bId = activeBookingId
            setMatchingState('IDLE')
            setActiveBookingId(null)
            navigation.navigate('BookingDetail', { bookingId: bId })
          }}
        >
          <Text style={styles.goToDetailText}>Vào phòng khám ngay</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Khám ngay tức thì</Text>
      </View>

      <View style={styles.banner}>
        <Ionicons name="flash" size={24} color="#f59e0b" />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Cơ chế Điều phối Grab-like</Text>
          <Text style={styles.bannerText}>
            Hệ thống tự động tìm và gửi yêu cầu tới bác sĩ gần nhất có lịch trống. Bác sĩ có 30 giây để chấp nhận.
          </Text>
        </View>
      </View>

      {/* Hình thức khám */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Hình thức khám *</Text>
        <View style={styles.typeSelector}>
          <TouchableOpacity
            style={[
              styles.typeBtn,
              consultationType === 'ONLINE' && styles.typeBtnActive,
            ]}
            onPress={() => setConsultationType('ONLINE')}
          >
            <Ionicons
              name="videocam"
              size={18}
              color={consultationType === 'ONLINE' ? '#fff' : Colors.textMuted}
            />
            <Text
              style={[
                styles.typeBtnText,
                consultationType === 'ONLINE' && styles.typeBtnTextActive,
              ]}
            >
              Tư vấn Online
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeBtn,
              consultationType === 'IN_PERSON' && styles.typeBtnActive,
            ]}
            onPress={() => setConsultationType('IN_PERSON')}
          >
            <Ionicons
              name="home"
              size={18}
              color={consultationType === 'IN_PERSON' ? '#fff' : Colors.textMuted}
            />
            <Text
              style={[
                styles.typeBtnText,
                consultationType === 'IN_PERSON' && styles.typeBtnTextActive,
              ]}
            >
              Khám tại nhà
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chọn chuyên khoa */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Chọn chuyên khoa *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {specialties.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.specChip,
                  selectedSpecialty === s.id && styles.specChipActive,
                ]}
                onPress={() => setSelectedSpecialty(s.id)}
              >
                <Text
                  style={[
                    styles.specChipText,
                    selectedSpecialty === s.id && styles.specChipTextActive,
                  ]}
                >
                  {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Bán kính quét */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Bán kính quét tối đa</Text>
        <View style={styles.radiusRow}>
          {[1, 3, 5, 10].map((r) => (
            <TouchableOpacity
              key={r}
              style={[
                styles.radiusBtn,
                radiusKm === r && styles.radiusBtnActive,
              ]}
              onPress={() => setRadiusKm(r)}
            >
              <Text
                style={[
                  styles.radiusBtnText,
                  radiusKm === r && styles.radiusBtnTextActive,
                ]}
              >
                {r} km
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Mô tả triệu chứng */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Mô tả triệu chứng / Lý do khám</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Ví dụ: Bị sốt cao từ tối qua, ho nhiều, đau họng..."
          value={symptoms}
          onChangeText={setSymptoms}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Địa chỉ hiện tại */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Vị trí của bạn</Text>
        <View style={styles.addressBox}>
          <Ionicons name="location" size={18} color={Colors.primary} />
          <TextInput
            style={styles.addressInput}
            value={address}
            onChangeText={setAddress}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, loading && { opacity: 0.7 }]}
        onPress={handleStartOnDemand}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="search" size={20} color="#fff" />
            <Text style={styles.submitBtnText}>Tìm Bác sĩ Ngay</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 12,
    marginBottom: 20,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  bannerText: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 2,
    lineHeight: 16,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    gap: 6,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  typeBtnActive: {
    backgroundColor: Colors.primary,
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  typeBtnTextActive: {
    color: '#fff',
  },
  specChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  specChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  specChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  specChipTextActive: {
    color: '#fff',
  },
  radiusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  radiusBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  radiusBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  radiusBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  radiusBtnTextActive: {
    color: Colors.primaryDark,
  },
  textArea: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
    height: 46,
  },
  addressInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  matchingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  radarWrapper: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    position: 'relative',
  },
  radarRing3: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: Colors.primaryLight,
    opacity: 0.4,
  },
  radarRing2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.primaryLight,
    opacity: 0.7,
  },
  radarRing1: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primaryLight,
  },
  radarCenter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  matchingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  matchingSub: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginVertical: 10,
    lineHeight: 18,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 6,
    marginTop: 16,
    marginBottom: 30,
  },
  countdownText: {
    fontSize: 14,
    color: '#92400e',
  },
  cancelMatchingBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelMatchingText: {
    fontSize: 14,
    color: Colors.danger,
    fontWeight: '700',
  },
  successContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  successCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
    lineHeight: 20,
  },
  goToDetailBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goToDetailText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})
