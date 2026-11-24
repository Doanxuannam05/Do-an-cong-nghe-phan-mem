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
import { getApiBaseUrl } from '../../config'

export const AdminSystemScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, logout, quickLogin } = useAuth()
  const [system, setSystem] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchSystem = async () => {
    try {
      const res = await api.getAdminSystem()
      setSystem(res)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchSystem()
  }, [])

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất tài khoản quản trị?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ])
  }

  const handleSwitchRole = (targetRole: 'DOCTOR' | 'PATIENT') => {
    const roleName = targetRole === 'DOCTOR' ? 'Bác sĩ' : 'Bệnh nhân'
    Alert.alert(
      'Chuyển đổi giao diện',
      `Bạn muốn chuyển sang giao diện ${roleName} để kiểm thử luồng thao tác?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Chuyển ngay',
          onPress: async () => {
            try {
              await quickLogin(targetRole)
            } catch (err: any) {
              Alert.alert('Lỗi', err.message || 'Không thể chuyển đổi vai trò')
            }
          },
        },
      ]
    )
  }

  const formatUptime = (sec: number) => {
    if (!sec) return '—'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    return `${h} giờ ${m} phút`
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Hệ thống & Cài đặt</Text>
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
              fetchSystem()
            }}
          />
        }
      >
        {/* Profile Card Admin */}
        <View style={styles.adminHeroCard}>
          <View style={styles.avatarLarge}>
            <Ionicons name="shield-checkmark" size={32} color={Colors.primaryDark} />
          </View>

          <Text style={styles.heroName}>{user?.fullName || 'Quản trị viên MediGo'}</Text>
          <Text style={styles.heroEmail}>{user?.email || 'admin@medigo.vn'}</Text>

          <View style={styles.adminPill}>
            <View style={styles.dotOnline} />
            <Text style={styles.adminPillTxt}>HỆ THỐNG TOÀN QUYỀN (ROOT ADMIN)</Text>
          </View>
        </View>

        {/* Giám sát máy chủ & Dịch vụ */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="hardware-chip-outline" size={18} color={Colors.primaryDark} />
            <Text style={styles.sectionTitle}>Tình trạng Máy chủ (Server Health)</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 14 }} />
          ) : (
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>
                  {system?.uptimeSec ? formatUptime(system.uptimeSec) : 'Bình thường'}
                </Text>
                <Text style={styles.metricLabel}>Thời gian hoạt động</Text>
              </View>

              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>
                  {system?.memoryMb ? `${system.memoryMb} MB` : '128 MB'}
                </Text>
                <Text style={styles.metricLabel}>RAM Node Process</Text>
              </View>

              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>
                  {system?.realtime?.connectedUsers ?? 1}
                </Text>
                <Text style={styles.metricLabel}>Người dùng SSE/WS</Text>
              </View>

              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>
                  {system?.directory?.doctors ?? 20}
                </Text>
                <Text style={styles.metricLabel}>Bác sĩ trong RAM</Text>
              </View>
            </View>
          )}

          <View style={styles.apiEndpointBox}>
            <Text style={styles.apiEndpointLabel}>Địa chỉ API Backend hiện tại:</Text>
            <Text style={styles.apiEndpointVal}>{getApiBaseUrl()}</Text>
          </View>
        </View>

        {/* Chuyển đổi giao diện kiểm thử */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Kiểm thử giao diện theo vai trò</Text>
          <Text style={styles.sectionSub}>
            Cho phép quản trị viên trải nghiệm tức thì màn hình của Bác sĩ hoặc Bệnh nhân mà không cần đăng nhập lại.
          </Text>

          <TouchableOpacity
            style={styles.switchRoleCard}
            onPress={() => handleSwitchRole('DOCTOR')}
          >
            <View style={[styles.switchIconBox, { backgroundColor: '#ecfdf5' }]}>
              <Ionicons name="medkit" size={20} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Giao diện Bác sĩ</Text>
              <Text style={styles.switchSub}>Nhận ca cấp cứu, lịch trực & khám bệnh</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchRoleCard}
            onPress={() => handleSwitchRole('PATIENT')}
          >
            <View style={[styles.switchIconBox, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="person" size={20} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Giao diện Bệnh nhân</Text>
              <Text style={styles.switchSub}>Tìm bác sĩ, gọi cấp cứu & gợi ý AI</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Nút đăng xuất */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          <Text style={styles.logoutTxt}>Đăng xuất tài khoản Quản trị</Text>
        </TouchableOpacity>
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
  adminHeroCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryGhost,
    borderWidth: 2,
    borderColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  heroEmail: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#a7f3d0',
    marginTop: 10,
  },
  dotOnline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  adminPillTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065f46',
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
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
  sectionSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginVertical: 6,
    lineHeight: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  metricItem: {
    width: '48.5%',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  apiEndpointBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 8,
  },
  apiEndpointLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  apiEndpointVal: {
    fontSize: 11,
    color: Colors.text,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  switchRoleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  switchIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
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
    marginTop: 4,
  },
  logoutTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.danger,
  },
})
