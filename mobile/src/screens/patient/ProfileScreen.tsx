import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { getApiBaseUrl, setApiBaseUrl } from '../../config'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const ProfileScreen: React.FC = () => {
  const { user, logout } = useAuth()
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl())
  const [editingApi, setEditingApi] = useState(false)

  const handleSaveApi = async () => {
    if (!apiUrl.trim()) return
    await setApiBaseUrl(apiUrl.trim())
    setEditingApi(false)
    Alert.alert('Thành công', 'Đã lưu cấu hình máy chủ API mới!')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Hồ sơ cá nhân</Text>
      </View>

      {/* User Info Card */}
      <View style={styles.userCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {(user?.fullName || 'MD').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.userName}>{user?.fullName || 'Người dùng'}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>

        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>
            {user?.role === 'PATIENT'
              ? 'Người bệnh'
              : user?.role === 'DOCTOR'
              ? 'Bác sĩ'
              : 'Quản trị viên'}
          </Text>
        </View>
      </View>

      {/* Thông tin chi tiết */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Thông tin tài khoản</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>ID người dùng</Text>
          <Text style={styles.rowValue}>#{user?.id}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Số điện thoại</Text>
          <Text style={styles.rowValue}>{user?.phone || 'Chưa cập nhật'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Mã định danh</Text>
          <Text style={styles.rowValue}>
            {user?.patientId
              ? `BN-${user.patientId}`
              : user?.doctorId
              ? `BS-${user.doctorId}`
              : 'ADM-01'}
          </Text>
        </View>
      </View>

      {/* Cấu hình kết nối Máy chủ Backend (Dành cho Dev & Demo qua Mobile) */}
      <View style={styles.card}>
        <View style={styles.serverHeader}>
          <Ionicons name="server-outline" size={18} color={Colors.primary} />
          <Text style={styles.cardTitle}>Địa chỉ máy chủ API</Text>
        </View>
        <Text style={styles.serverDesc}>
          Nếu bạn dùng điện thoại thật kết nối qua Wi-Fi chung, hãy đặt IP LAN của máy tính chạy backend:
        </Text>

        <TextInput
          style={styles.apiInput}
          value={apiUrl}
          onChangeText={(v) => {
            setApiUrl(v)
            setEditingApi(true)
          }}
          autoCapitalize="none"
        />

        <View style={styles.quickIpRow}>
          <TouchableOpacity
            style={styles.quickIpBtn}
            onPress={() => {
              setApiUrl('http://192.168.1.21:3001/api')
              setEditingApi(true)
            }}
          >
            <Text style={styles.quickIpText}>Wi-Fi LAN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickIpBtn}
            onPress={() => {
              setApiUrl('http://10.0.2.2:3001/api')
              setEditingApi(true)
            }}
          >
            <Text style={styles.quickIpText}>Android Emu</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickIpBtn}
            onPress={() => {
              setApiUrl('http://localhost:3001/api')
              setEditingApi(true)
            }}
          >
            <Text style={styles.quickIpText}>Localhost</Text>
          </TouchableOpacity>
        </View>

        {editingApi && (
          <TouchableOpacity style={styles.saveApiBtn} onPress={handleSaveApi}>
            <Text style={styles.saveApiText}>Lưu cấu hình Server</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Nút Đăng xuất */}
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
        <Text style={styles.logoutText}>Đăng xuất</Text>
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
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  userEmail: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: Colors.primaryGhost,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowLabel: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  serverDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 10,
    lineHeight: 16,
  },
  apiInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    color: Colors.text,
    marginBottom: 8,
  },
  quickIpRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  quickIpBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickIpText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  saveApiBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveApiText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  logoutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#fecdd3',
    gap: 8,
  },
  logoutText: {
    color: Colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
})
