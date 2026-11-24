import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const DoctorProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, logout, quickLogin } = useAuth()
  const [profile, setProfile] = useState<any | null>(null)
  const [stats, setStats] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchProfile = async () => {
    try {
      const [meRes, statsRes] = await Promise.allSettled([
        api.getDoctorMe(),
        api.getDoctorStats(),
      ])
      if (meRes.status === 'fulfilled' && meRes.value) {
        setProfile(meRes.value)
      }
      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setStats(statsRes.value)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất tài khoản?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: logout,
      },
    ])
  }

  const handleSwitchToPatient = async () => {
    Alert.alert(
      'Chuyển đổi giao diện',
      'Bạn muốn chuyển sang giao diện Bệnh nhân để tìm kiếm bác sĩ hoặc đặt lịch hẹn?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Chuyển đổi',
          onPress: async () => {
            try {
              await quickLogin('PATIENT')
            } catch (err: any) {
              Alert.alert('Lỗi', err.message || 'Không thể chuyển đổi vai trò')
            }
          },
        },
      ]
    )
  }

  const doctorName = profile?.fullName || user?.fullName || 'Bác sĩ'
  const specialtyName =
    profile?.specialty?.name ||
    profile?.specialties?.[0]?.name ||
    (user as any)?.specialty ||
    'Bác sĩ Đa khoa'
  const verification = profile?.verificationStatus || user?.verificationStatus
  const clinicName = profile?.clinic?.name || 'Phòng khám Đa khoa MediGo'
  const clinicAddress = profile?.clinic?.address || 'Hải Châu, Đà Nẵng'
  const experienceYears = profile?.experienceYears || 5
  const education = profile?.education || 'Bác sĩ Chuyên khoa I'
  const licenseNumber = profile?.licenseNumber || '012345/BYT-CCHN'
  const feeVnd = profile?.consultationFee
    ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(profile.consultationFee)
    : '200.000 đ'

  const ratingVal = profile?.rating || stats?.rating ? (profile?.rating || stats?.rating).toFixed(1) : '5.0'
  const totalReviews = profile?.totalReviews || stats?.totalReviews || 0

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Hồ sơ Bác sĩ</Text>
        <TouchableOpacity style={styles.logoutIconBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color={Colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              fetchProfile()
            }}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Card thông tin định danh */}
            <View style={styles.profileHeroCard}>
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarLargeTxt}>
                  {doctorName.split(' ').pop()?.[0]?.toUpperCase() || 'B'}
                </Text>
              </View>

              <Text style={styles.heroName}>BS. {doctorName}</Text>
              <Text style={styles.heroSpecialty}>{specialtyName}</Text>

              <View style={styles.badgeRow}>
                {verification === 'APPROVED' ? (
                  <View style={styles.verifiedPill}>
                    <Ionicons name="checkmark-circle" size={14} color="#059669" />
                    <Text style={styles.verifiedPillTxt}>Hồ sơ đã được phê duyệt</Text>
                  </View>
                ) : (
                  <View style={styles.pendingPill}>
                    <Ionicons name="time" size={14} color="#d97706" />
                    <Text style={styles.pendingPillTxt}>Đang chờ duyệt</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Chỉ số danh tiếng */}
            <View style={styles.reputationCard}>
              <View style={styles.reputationItem}>
                <View style={styles.repValRow}>
                  <Ionicons name="star" size={16} color="#f59e0b" />
                  <Text style={styles.repValTxt}>{ratingVal}</Text>
                </View>
                <Text style={styles.repLabel}>{totalReviews} đánh giá</Text>
              </View>

              <View style={styles.repDivider} />

              <View style={styles.reputationItem}>
                <Text style={styles.repValTxt}>{experienceYears} năm</Text>
                <Text style={styles.repLabel}>Kinh nghiệm</Text>
              </View>

              <View style={styles.repDivider} />

              <View style={styles.reputationItem}>
                <Text style={styles.repValTxt}>{feeVnd}</Text>
                <Text style={styles.repLabel}>Giá khám</Text>
              </View>
            </View>

            {/* Thông tin chứng chỉ & Chuyên môn */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Thông tin chuyên môn</Text>

              <View style={styles.infoRow}>
                <Ionicons name="school-outline" size={18} color={Colors.primaryDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoRowLabel}>Học vị / Học hàm</Text>
                  <Text style={styles.infoRowVal}>{education}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="medkit-outline" size={18} color={Colors.primaryDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoRowLabel}>Chuyên khoa</Text>
                  <Text style={styles.infoRowVal}>{specialtyName}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="business-outline" size={18} color={Colors.primaryDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoRowLabel}>Nơi công tác</Text>
                  <Text style={styles.infoRowVal}>{clinicName}</Text>
                  <Text style={styles.infoRowSub}>{clinicAddress}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="document-text-outline" size={18} color={Colors.primaryDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoRowLabel}>Chứng chỉ hành nghề (CCHN)</Text>
                  <Text style={styles.infoRowVal}>{licenseNumber}</Text>
                </View>
              </View>
            </View>

            {/* Chuyển đổi vai trò & Cài đặt */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Tùy chọn & Tài khoản</Text>

              <TouchableOpacity
                style={styles.switchRoleCard}
                onPress={handleSwitchToPatient}
              >
                <View style={styles.switchIconBox}>
                  <Ionicons name="swap-horizontal" size={20} color={Colors.primaryDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Chuyển sang giao diện Bệnh nhân</Text>
                  <Text style={styles.switchSub}>
                    Trải nghiệm ứng dụng dưới góc nhìn người bệnh tìm bác sĩ
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
                <Text style={styles.logoutTxt}>Đăng xuất khỏi thiết bị</Text>
              </TouchableOpacity>
            </View>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  logoutIconBtn: {
    padding: 6,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  profileHeroCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  avatarLarge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primaryGhost,
    borderWidth: 2,
    borderColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarLargeTxt: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  heroName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  heroSpecialty: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  badgeRow: {
    marginTop: 8,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#a7f3d0',
  },
  verifiedPillTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#fde68a',
  },
  pendingPillTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  reputationCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  reputationItem: {
    alignItems: 'center',
  },
  repValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  repValTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  repLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  repDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#e2e8f0',
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  infoRowLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  infoRowVal: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 1,
  },
  infoRowSub: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 1,
  },
  switchRoleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.primaryGhost,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    marginBottom: 12,
  },
  switchIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  switchSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  logoutTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.danger,
  },
})
