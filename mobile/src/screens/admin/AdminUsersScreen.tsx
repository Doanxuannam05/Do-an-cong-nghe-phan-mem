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
} from 'react-native'
import { api } from '../../services/api'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

const ROLES = [
  { key: '', label: 'Tất cả' },
  { key: 'PATIENT', label: 'Bệnh nhân' },
  { key: 'DOCTOR', label: 'Bác sĩ' },
  { key: 'ADMIN', label: 'Quản trị' },
] as const

export const AdminUsersScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [users, setUsers] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)

  const fetchUsers = async (role = roleFilter) => {
    try {
      const res = await api.getAdminUsers({
        role: role || undefined,
        q: searchText.trim() || undefined,
      })
      setUsers(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [])
      setTotalCount(res?.total || 0)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchUsers(roleFilter)
  }, [roleFilter])

  const handleSearchSubmit = () => {
    setLoading(true)
    fetchUsers(roleFilter)
  }

  const handleToggleActive = (user: any) => {
    const nextState = !user.is_active
    const actionTxt = nextState ? 'mở khóa' : 'khóa'

    Alert.alert(
      `Xác nhận ${actionTxt} tài khoản`,
      `Bạn có chắc chắn muốn ${actionTxt} tài khoản ${user.full_name} (${user.email})?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: nextState ? 'Mở khóa' : 'Khóa tài khoản',
          style: nextState ? 'default' : 'destructive',
          onPress: async () => {
            setActionLoadingId(user.id)
            try {
              await api.toggleUserActive(user.id, nextState)
              setUsers((prev) =>
                prev.map((u) => (u.id === user.id ? { ...u, is_active: nextState } : u))
              )
              Alert.alert('Thành công', `Đã ${actionTxt} tài khoản thành công!`)
            } catch (err: any) {
              Alert.alert('Lỗi', err.message || `Không thể ${actionTxt} tài khoản`)
            } finally {
              setActionLoadingId(null)
            }
          },
        },
      ]
    )
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return { label: 'Quản trị viên', bg: '#fef3c7', text: '#92400e' }
      case 'DOCTOR':
        return { label: 'Bác sĩ', bg: '#ecfdf5', text: '#059669' }
      default:
        return { label: 'Bệnh nhân', bg: '#eff6ff', text: '#2563eb' }
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Quản lý Người dùng ({totalCount || users.length})</Text>
        <Text style={styles.headerSub}>
          Kiểm soát quyền truy cập, phân quyền và khóa tài khoản vi phạm
        </Text>

        {/* Thanh tìm kiếm */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo họ tên hoặc email..."
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            placeholderTextColor={Colors.textLight}
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchText('')
                fetchUsers(roleFilter)
              }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs vai trò */}
        <View style={styles.tabsRow}>
          {ROLES.map((r) => {
            const isActive = roleFilter === r.key
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setRoleFilter(r.key)}
              >
                <Text style={[styles.tabTxt, isActive && styles.tabTxtActive]}>
                  {r.label}
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
              fetchUsers(roleFilter)
            }}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : users.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Không tìm thấy người dùng</Text>
            <Text style={styles.emptySub}>
              Không có tài khoản nào phù hợp với bộ lọc tìm kiếm.
            </Text>
          </View>
        ) : (
          users.map((u) => {
            const roleBadge = getRoleBadge(u.role)
            const isActive = u.is_active !== false
            const isSelf = u.id === 1 // hoặc kiểm tra nếu là tài khoản hiện tại

            return (
              <View key={u.id} style={styles.userCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarTxt}>
                      {(u.full_name || 'U')[0].toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{u.full_name || 'Chưa đặt tên'}</Text>
                    <Text style={styles.userEmail}>{u.email}</Text>
                    {u.phone && <Text style={styles.userPhone}>SĐT: {u.phone}</Text>}
                  </View>

                  <View style={[styles.roleBadge, { backgroundColor: roleBadge.bg }]}>
                    <Text style={[styles.roleBadgeTxt, { color: roleBadge.text }]}>
                      {roleBadge.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.statsCol}>
                    <Text style={styles.bookingCountTxt}>
                      {u.bookings || 0} ca khám liên quan
                    </Text>
                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: isActive ? '#10b981' : '#ef4444' },
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusLabel,
                          { color: isActive ? '#059669' : '#e11d48' },
                        ]}
                      >
                        {isActive ? 'Đang hoạt động' : 'Đã bị khóa'}
                      </Text>
                    </View>
                  </View>

                  {u.role !== 'ADMIN' && (
                    <TouchableOpacity
                      style={[
                        styles.toggleBtn,
                        isActive ? styles.lockBtn : styles.unlockBtn,
                      ]}
                      disabled={actionLoadingId === u.id}
                      onPress={() => handleToggleActive(u)}
                    >
                      {actionLoadingId === u.id ? (
                        <ActivityIndicator size="small" color={isActive ? '#e11d48' : '#059669'} />
                      ) : (
                        <>
                          <Ionicons
                            name={isActive ? 'lock-closed-outline' : 'lock-open-outline'}
                            size={14}
                            color={isActive ? '#e11d48' : '#059669'}
                          />
                          <Text
                            style={[
                              styles.toggleBtnTxt,
                              { color: isActive ? '#e11d48' : '#059669' },
                            ]}
                          >
                            {isActive ? 'Khóa' : 'Mở khóa'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
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
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
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
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  userName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  userEmail: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
  },
  userPhone: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeTxt: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  statsCol: {
    gap: 2,
  },
  bookingCountTxt: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  lockBtn: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  unlockBtn: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  toggleBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
})
