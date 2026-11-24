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
  Alert,
  Modal,
} from 'react-native'
import { api } from '../../services/api'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

const FILTERS = [
  { key: 'PENDING', label: 'Chờ duyệt' },
  { key: 'APPROVED', label: 'Đã duyệt' },
  { key: 'REJECTED', label: 'Từ chối' },
  { key: '', label: 'Tất cả' },
] as const

export const AdminDoctorsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [filter, setFilter] = useState<string>('PENDING')
  const [doctors, setDoctors] = useState<any[]>([])
  const [counts, setCounts] = useState<{ PENDING: number; APPROVED: number; REJECTED: number }>({
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Modal từ chối hồ sơ
  const [rejectModalVisible, setRejectModalVisible] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const fetchDoctors = async (statusFilter = filter) => {
    try {
      const res = await api.getAdminDoctors({
        verification: statusFilter || undefined,
      })
      setDoctors(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [])
      if (res?.counts) {
        setCounts(res.counts)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchDoctors(filter)
  }, [filter])

  const handleApprove = (id: number, name: string) => {
    Alert.alert(
      'Phê duyệt bác sĩ',
      `Bạn có chắc chắn muốn duyệt hồ sơ của BS. ${name} để bác sĩ xuất hiện trên hệ thống và nhận ca khám?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Phê duyệt',
          onPress: async () => {
            setActionLoading(true)
            try {
              await api.verifyDoctor(id, 'APPROVED')
              Alert.alert('Thành công', 'Đã phê duyệt hồ sơ bác sĩ!')
              fetchDoctors(filter)
            } catch (err: any) {
              Alert.alert('Lỗi', err.message || 'Không thể duyệt hồ sơ')
            } finally {
              setActionLoading(false)
            }
          },
        },
      ]
    )
  }

  const openRejectModal = (id: number) => {
    setSelectedDocId(id)
    setRejectNote('')
    setRejectModalVisible(true)
  }

  const handleConfirmReject = async () => {
    if (!selectedDocId) return
    if (!rejectNote.trim()) {
      Alert.alert('Cảnh báo', 'Vui lòng nhập lý do từ chối để bác sĩ nắm rõ và bổ sung hồ sơ.')
      return
    }

    setActionLoading(true)
    try {
      await api.verifyDoctor(selectedDocId, 'REJECTED', rejectNote.trim())
      Alert.alert('Đã từ chối', 'Đã cập nhật trạng thái từ chối và thông báo lý do đến bác sĩ.')
      setRejectModalVisible(false)
      fetchDoctors(filter)
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể từ chối hồ sơ')
    } finally {
      setActionLoading(false)
    }
  }

  // Lọc theo tìm kiếm
  const filteredList = doctors.filter((d) => {
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    const name = (d.fullName || d.name || '').toLowerCase()
    const email = (d.email || '').toLowerCase()
    const spec = (d.specialty?.name || '').toLowerCase()
    return name.includes(q) || email.includes(q) || spec.includes(q)
  })

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Xét duyệt Hồ sơ Bác sĩ</Text>
        <Text style={styles.headerSub}>
          Kiểm định văn bằng, chứng chỉ hành nghề và cấp quyền khám bệnh
        </Text>

        {/* Thanh tìm kiếm */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên bác sĩ, email hoặc chuyên khoa..."
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

        {/* Tabs phân loại */}
        <View style={styles.tabsRow}>
          {FILTERS.map((f) => {
            const isActive = filter === f.key
            const count =
              f.key === 'PENDING'
                ? counts.PENDING
                : f.key === 'APPROVED'
                ? counts.APPROVED
                : f.key === 'REJECTED'
                ? counts.REJECTED
                : null

            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.tabTxt, isActive && styles.tabTxtActive]}>
                  {f.label}
                  {count != null ? ` (${count})` : ''}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              fetchDoctors(filter)
            }}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="shield-checkmark-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Không có hồ sơ nào</Text>
            <Text style={styles.emptySub}>
              {filter === 'PENDING'
                ? 'Tuyệt vời! Hiện tại không còn hồ sơ bác sĩ nào cần chờ phê duyệt.'
                : 'Không tìm thấy bác sĩ phù hợp với tiêu chí lọc.'}
            </Text>
          </View>
        ) : (
          filteredList.map((doc) => {
            const isPending = doc.verificationStatus === 'PENDING'
            const isApproved = doc.verificationStatus === 'APPROVED'
            const isRejected = doc.verificationStatus === 'REJECTED'

            const specialty =
              doc.specialty?.name || doc.specialties?.[0]?.name || 'Chưa cập nhật chuyên khoa'
            const feeVnd = doc.consultationFee
              ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(doc.consultationFee)
              : '200.000 đ'

            return (
              <View key={doc.id} style={styles.doctorCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatarBox}>
                    <Text style={styles.avatarTxt}>
                      {(doc.fullName || 'BS')[0].toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorName}>BS. {doc.fullName || doc.name}</Text>
                    <Text style={styles.doctorEmail}>{doc.email} · {doc.phone || 'Chưa có SĐT'}</Text>
                    <Text style={styles.doctorSpecialty}>{specialty}</Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: isApproved
                          ? '#ecfdf5'
                          : isPending
                          ? '#fffbeb'
                          : '#fff1f2',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeTxt,
                        {
                          color: isApproved
                            ? '#059669'
                            : isPending
                            ? '#b45309'
                            : '#e11d48',
                        },
                      ]}
                    >
                      {isApproved ? 'Đã duyệt' : isPending ? 'Chờ duyệt' : 'Đã từ chối'}
                    </Text>
                  </View>
                </View>

                {/* Thông tin chứng thực */}
                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <Ionicons name="document-text-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.infoTxt}>
                      Số CCHN: <Text style={{ fontWeight: '700' }}>{doc.licenseNumber || '012345/BYT'}</Text>
                    </Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="school-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.infoTxt}>
                      Học vị: {doc.education || 'Bác sĩ Chuyên khoa'} · {doc.experienceYears || 5} năm kinh nghiệm
                    </Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="cash-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.infoTxt}>Giá khám niêm yết: {feeVnd}</Text>
                  </View>

                  {doc.verificationNote && (
                    <View style={styles.noteBox}>
                      <Text style={styles.noteLabel}>Ghi chú thẩm định:</Text>
                      <Text style={styles.noteTxt}>{doc.verificationNote}</Text>
                    </View>
                  )}
                </View>

                {/* Nút thao tác Admin */}
                <View style={styles.actionsRow}>
                  {isPending && (
                    <>
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        disabled={actionLoading}
                        onPress={() => openRejectModal(doc.id)}
                      >
                        <Ionicons name="close-circle-outline" size={16} color="#e11d48" />
                        <Text style={styles.rejectBtnTxt}>Từ chối</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.approveBtn}
                        disabled={actionLoading}
                        onPress={() => handleApprove(doc.id, doc.fullName || doc.name)}
                      >
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.approveBtnTxt}>Phê duyệt ngay</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {isApproved && (
                    <TouchableOpacity
                      style={styles.revokeBtn}
                      disabled={actionLoading}
                      onPress={() => openRejectModal(doc.id)}
                    >
                      <Text style={styles.revokeBtnTxt}>Thu hồi phê duyệt / Tạm ngưng</Text>
                    </TouchableOpacity>
                  )}

                  {isRejected && (
                    <TouchableOpacity
                      style={styles.approveBtn}
                      disabled={actionLoading}
                      onPress={() => handleApprove(doc.id, doc.fullName || doc.name)}
                    >
                      <Ionicons name="reload" size={16} color="#fff" />
                      <Text style={styles.approveBtnTxt}>Duyệt lại hồ sơ</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      {/* Modal nhập lý do từ chối hồ sơ */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Từ chối hồ sơ Bác sĩ</Text>
            <Text style={styles.modalSub}>
              Vui lòng nêu rõ lý do (ví dụ: Thiếu ảnh chứng chỉ hành nghề, bằng cấp chưa công chứng...):
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Nhập lý do từ chối gửi tới bác sĩ..."
              value={rejectNote}
              onChangeText={setRejectNote}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={styles.modalCancelTxt}>Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirm}
                disabled={actionLoading}
                onPress={handleConfirmReject}
              >
                <Text style={styles.modalConfirmTxt}>Xác nhận từ chối</Text>
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
    gap: 6,
  },
  tabBtn: {
    paddingHorizontal: 10,
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
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTxtActive: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    paddingBottom: 36,
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
  doctorCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarBox: {
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
  doctorName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  doctorEmail: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  doctorSpecialty: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primaryDark,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeTxt: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardBody: {
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoTxt: {
    fontSize: 12,
    color: Colors.text,
  },
  noteBox: {
    backgroundColor: '#fff1f2',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  noteLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9f1239',
  },
  noteTxt: {
    fontSize: 11,
    color: '#be123c',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  rejectBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e11d48',
  },
  approveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#059669',
  },
  approveBtnTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  revokeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  revokeBtnTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginVertical: 6,
    lineHeight: 16,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    fontSize: 13,
    color: Colors.text,
    height: 70,
    textAlignVertical: 'top',
    marginVertical: 10,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  modalCancelTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  modalConfirm: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#e11d48',
  },
  modalConfirmTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
})
