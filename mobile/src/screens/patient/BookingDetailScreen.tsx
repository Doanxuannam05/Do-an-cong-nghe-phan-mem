import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const BookingDetailScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { bookingId } = route.params
  const { user } = useAuth()
  const [detail, setDetail] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Review modal
  const [reviewModalVisible, setReviewModalVisible] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  // Doctor Consultation modal
  const [consultModalVisible, setConsultModalVisible] = useState(false)
  const [consultNotes, setConsultNotes] = useState('')
  const [consultAdvice, setConsultAdvice] = useState('')
  const [consultFollowUp, setConsultFollowUp] = useState('')

  const fetchDetail = async () => {
    try {
      const data = await api.getBookingDetail(bookingId)
      setDetail(data)
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể tải chi tiết ca khám')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
    const interval = setInterval(fetchDetail, 5000)
    return () => clearInterval(interval)
  }, [bookingId])

  const handleCancel = () => {
    Alert.alert('Xác nhận', 'Bạn có chắc chắn muốn hủy ca khám này không?', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Hủy ca',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true)
          try {
            await api.cancelBooking(bookingId, 'Người dùng hủy')
            fetchDetail()
          } catch (e: any) {
            Alert.alert('Lỗi', e.message)
          } finally {
            setActionLoading(false)
          }
        },
      },
    ])
  }

  const handleDoctorAccept = async () => {
    setActionLoading(true)
    try {
      await api.acceptBooking(bookingId)
      fetchDetail()
    } catch (e: any) {
      Alert.alert('Lỗi', e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDoctorReject = async () => {
    setActionLoading(true)
    try {
      await api.rejectBooking(bookingId, 'Bác sĩ bận')
      fetchDetail()
    } catch (e: any) {
      Alert.alert('Lỗi', e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDoctorStartConsultation = async () => {
    setActionLoading(true)
    try {
      await api.startConsultation(bookingId)
      Alert.alert('Thành công', 'Đã bắt đầu phiên khám bệnh!')
      fetchDetail()
    } catch (e: any) {
      Alert.alert('Lỗi', e.message || 'Không thể bắt đầu ca khám')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDoctorEndConsultation = async () => {
    setActionLoading(true)
    try {
      await api.endConsultation(bookingId, {
        notes: consultNotes,
        advice: consultAdvice,
        followUp: consultFollowUp,
      })
      Alert.alert('Thành công', 'Đã hoàn tất ca khám và cập nhật hồ sơ bệnh án!')
      setConsultModalVisible(false)
      fetchDetail()
    } catch (e: any) {
      Alert.alert('Lỗi', e.message || 'Không thể kết thúc ca khám')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePayment = async () => {
    setActionLoading(true)
    try {
      await api.createPayment({ bookingId, method: 'MOMO' })
      Alert.alert('Thành công', 'Thanh toán giả lập thành công!')
      fetchDetail()
    } catch (e: any) {
      Alert.alert('Thanh toán thất bại', e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSubmitReview = async () => {
    setActionLoading(true)
    try {
      await api.submitReview({ bookingId, rating, comment })
      Alert.alert('Cảm ơn', 'Đánh giá của bạn đã được ghi nhận!')
      setReviewModalVisible(false)
      fetchDetail()
    } catch (e: any) {
      Alert.alert('Lỗi', e.message)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    )
  }

  if (!detail) {
    return (
      <View style={styles.centerContainer}>
        <Text style={{ color: Colors.textMuted }}>Không tìm thấy thông tin ca khám</Text>
      </View>
    )
  }

  const isDoctor = user?.role === 'DOCTOR'
  const isPatient = user?.role === 'PATIENT'

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.navHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Chi tiết ca khám #{detail.id}</Text>
        </View>

        {/* Trạng thái chính */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.statusLabel}>Trạng thái hiện tại</Text>
              <Text style={styles.statusTitle}>{detail.status}</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {detail.type === 'ON_DEMAND' ? 'Khám ngay' : 'Đặt lịch'}
              </Text>
            </View>
          </View>
          <Text style={styles.statusTime}>
            Tạo lúc: {new Date(detail.created_at || detail.createdAt || Date.now()).toLocaleString('vi-VN')}
          </Text>
        </View>

        {/* Thông tin đối tác khám */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>
            {isDoctor ? 'Thông tin Bệnh nhân' : 'Thông tin Bác sĩ'}
          </Text>

          <View style={styles.infoRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarTxt}>
                {(isDoctor
                  ? detail.patient_name || detail.patientName || 'BN'
                  : detail.doctor?.fullName || detail.doctorName || detail.doctor_name || 'BS'
                )
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>
                {isDoctor
                  ? detail.patient_name || detail.patientName || `Bệnh nhân #${detail.patient_id || detail.id}`
                  : detail.doctor?.fullName || detail.doctorName || detail.doctor_name || 'Đang điều phối bác sĩ...'}
              </Text>
              <Text style={styles.personSub}>
                Chuyên khoa: {detail.specialty_name || detail.specialtyName || 'Đa khoa'}
              </Text>
              {(detail.doctor_phone || detail.doctorPhone) && (
                <Text style={styles.personSub}>SĐT: {detail.doctor_phone || detail.doctorPhone}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Triệu chứng & Ghi chú */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Triệu chứng / Ghi chú</Text>
          <Text style={styles.symptomText}>
            {detail.symptoms || 'Không có mô tả triệu chứng cụ thể.'}
          </Text>
          {detail.address && (
            <View style={styles.addressRow}>
              <Ionicons name="location" size={16} color={Colors.primary} />
              <Text style={styles.addressText}>{detail.address}</Text>
            </View>
          )}
        </View>

        {/* Khu vực Tương tác Real-time: Chat & Video Call */}
        {['CONFIRMED', 'IN_PROGRESS'].includes(detail.status) && (
          <View style={styles.interactiveCard}>
            <Text style={styles.interactiveTitle}>Phòng Tư Vấn Trực Tuyến</Text>
            <Text style={styles.interactiveDesc}>
              Trao đổi tức thì với đối tác qua kênh chat bảo mật hoặc gọi video.
            </Text>

            <View style={styles.interactiveRow}>
              <TouchableOpacity
                style={styles.chatActionBtn}
                onPress={() =>
                  navigation.navigate('Chat', {
                    bookingId: detail.id,
                    targetName: isDoctor
                      ? detail.patientName || 'Bệnh nhân'
                      : detail.doctorName || 'Bác sĩ',
                  })
                }
              >
                <Ionicons
                  name="chatbubbles"
                  size={20}
                  color={Colors.primaryDark}
                />
                <Text style={styles.chatActionTxt}>Nhắn tin</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.callActionBtn}
                onPress={() =>
                  navigation.navigate('VideoCall', {
                    bookingId: detail.id,
                    targetName: isDoctor
                      ? detail.patientName || 'Bệnh nhân'
                      : detail.doctorName || 'Bác sĩ',
                  })
                }
              >
                <Ionicons name="videocam" size={20} color="#fff" />
                <Text style={styles.callActionTxt}>Gọi Video</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Nút hành động dành cho Bác sĩ nhận/từ chối */}
        {isDoctor && detail.status === 'DISPATCHING' && (
          <View style={styles.doctorActionRow}>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={handleDoctorReject}
              disabled={actionLoading}
            >
              <Text style={styles.rejectBtnText}>Từ chối</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={handleDoctorAccept}
              disabled={actionLoading}
            >
              <Text style={styles.acceptBtnText}>Chấp nhận ca (30s)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Nút hành động Bác sĩ Bắt đầu khám (khi đã CONFIRMED) */}
        {isDoctor && detail.status === 'CONFIRMED' && (
          <View style={{ marginTop: 12 }}>
            <TouchableOpacity
              style={[styles.acceptBtn, { paddingVertical: 14 }]}
              onPress={handleDoctorStartConsultation}
              disabled={actionLoading}
            >
              <Ionicons name="play-circle" size={20} color="#fff" />
              <Text style={[styles.acceptBtnText, { fontSize: 15 }]}>
                Bắt đầu ca khám ngay
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Nút hành động Bác sĩ Hoàn tất ca khám (khi đang IN_PROGRESS) */}
        {isDoctor && detail.status === 'IN_PROGRESS' && (
          <View style={{ marginTop: 12 }}>
            <View style={{ backgroundColor: '#ecfdf5', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#a7f3d0' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#065f46' }}>
                Ca khám đang diễn ra
              </Text>
              <Text style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>
                Sau khi tư vấn xong cho bệnh nhân qua Video hoặc tại chỗ, bấm nút bên dưới để hoàn tất ca và lưu hồ sơ.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: '#059669', paddingVertical: 14 }]}
              onPress={() => setConsultModalVisible(true)}
              disabled={actionLoading}
            >
              <Ionicons name="checkmark-done-circle" size={20} color="#fff" />
              <Text style={[styles.acceptBtnText, { fontSize: 15 }]}>
                Kết thúc ca khám & Ghi kết quả
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Nút hành động khi hoàn thành (Thanh toán & Đánh giá) */}
        {isPatient && detail.status === 'COMPLETED' && (
          <View style={styles.completedActions}>
            <TouchableOpacity
              style={styles.payBtn}
              onPress={handlePayment}
              disabled={actionLoading}
            >
              <Ionicons name="card" size={18} color="#fff" />
              <Text style={styles.payBtnText}>Thanh toán giả lập</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reviewBtn}
              onPress={() => setReviewModalVisible(true)}
              disabled={actionLoading}
            >
              <Ionicons name="star" size={18} color={Colors.warning} />
              <Text style={styles.reviewBtnText}>Đánh giá Bác sĩ</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Nút Hủy ca */}
        {['PENDING', 'DISPATCHING', 'CONFIRMED'].includes(detail.status) && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={actionLoading}
          >
            <Text style={styles.cancelBtnText}>Hủy ca khám này</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Modal Hoàn tất ca khám dành cho Bác sĩ */}
      <Modal
        visible={consultModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setConsultModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>Kết thúc ca khám</Text>
            <Text style={styles.modalSub}>
              Ghi nhận chẩn đoán và hướng dẫn điều trị cho bệnh nhân:
            </Text>

            <ScrollView style={{ width: '100%', marginVertical: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 }}>
                Chẩn đoán & Ghi chú lâm sàng:
              </Text>
              <TextInput
                style={[styles.commentInput, { height: 70, marginBottom: 12 }]}
                placeholder="Ví dụ: Viêm họng cấp, không sốt..."
                value={consultNotes}
                onChangeText={setConsultNotes}
                multiline
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 }}>
                Lời khuyên & Đơn thuốc:
              </Text>
              <TextInput
                style={[styles.commentInput, { height: 70, marginBottom: 12 }]}
                placeholder="Ví dụ: Uống nhiều nước ấm, súc họng nước muối..."
                value={consultAdvice}
                onChangeText={setConsultAdvice}
                multiline
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 }}>
                Hẹn tái khám (nếu có):
              </Text>
              <TextInput
                style={[styles.commentInput, { height: 44 }]}
                placeholder="Ví dụ: Tái khám sau 3 ngày nếu còn đau họng"
                value={consultFollowUp}
                onChangeText={setConsultFollowUp}
              />
            </ScrollView>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setConsultModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: '#059669' }]}
                onPress={handleDoctorEndConsultation}
                disabled={actionLoading}
              >
                <Text style={styles.modalSubmitText}>Hoàn tất ca</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={reviewModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Đánh giá Bác sĩ</Text>
            <Text style={styles.modalSub}>
              Trải nghiệm tư vấn của bạn như thế nào?
            </Text>

            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity key={s} onPress={() => setRating(s)}>
                  <Ionicons
                    name={s <= rating ? 'star' : 'star-outline'}
                    size={36}
                    color="#f59e0b"
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.commentInput}
              placeholder="Nhận xét của bạn (ví dụ: Bác sĩ rất chu đáo...)"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setReviewModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmit}
                onPress={handleSubmitReview}
              >
                <Text style={styles.modalSubmitText}>Gửi đánh giá</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 40,
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
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  statusTime: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  personName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  personSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  symptomText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addressText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  interactiveCard: {
    backgroundColor: Colors.primaryGhost,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    marginBottom: 14,
  },
  interactiveTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  interactiveDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 14,
  },
  interactiveRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chatActionBtn: {
    flex: 1,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: 6,
  },
  chatActionTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  callActionBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  callActionTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  doctorActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.danger,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  rejectBtnText: {
    color: Colors.danger,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 2,
    backgroundColor: Colors.success,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  completedActions: {
    gap: 10,
    marginBottom: 14,
  },
  payBtn: {
    backgroundColor: Colors.secondary,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  reviewBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.warning,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reviewBtnText: {
    color: '#b45309',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
  },
  cancelBtnText: {
    color: Colors.danger,
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSub: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 18,
  },
  commentInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: Colors.textMuted,
    fontWeight: '600',
  },
  modalSubmit: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalSubmitText: {
    color: '#fff',
    fontWeight: '700',
  },
})
