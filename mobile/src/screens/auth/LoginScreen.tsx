import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { getApiBaseUrl, setApiBaseUrl } from '../../config'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const LoginScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { login, quickLogin } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // Server settings modal
  const [showServerModal, setShowServerModal] = useState(false)
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl())

  useEffect(() => {
    setServerUrl(getApiBaseUrl())
  }, [])

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Thông báo', 'Vui lòng nhập đầy đủ email và mật khẩu')
      return
    }
    setLoading(true)
    try {
      await login(email.trim(), password)
    } catch (err: any) {
      Alert.alert('Đăng nhập thất bại', err.message || 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }

  const handleQuick = async (role: 'PATIENT' | 'DOCTOR' | 'ADMIN') => {
    setLoading(true)
    try {
      await quickLogin(role)
    } catch (err: any) {
      Alert.alert('Đăng nhập thất bại', err.message || 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveServer = async () => {
    if (!serverUrl.trim()) return
    await setApiBaseUrl(serverUrl.trim())
    setShowServerModal(false)
    Alert.alert('Đã cập nhật', `Địa chỉ máy chủ mới: ${serverUrl.trim()}`)
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="medical" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.appName}>MediGo</Text>
          <Text style={styles.subTitle}>
            Kết nối Bác sĩ & Người bệnh theo vị trí
          </Text>

          {/* Nút xem/đổi IP Server */}
          <TouchableOpacity
            style={styles.serverBadge}
            onPress={() => setShowServerModal(true)}
          >
            <Ionicons name="wifi-outline" size={13} color={Colors.primary} />
            <Text style={styles.serverBadgeText}>
              Server: {serverUrl.replace(/^https?:\/\//, '').replace(/\/api$/, '')}
            </Text>
            <Ionicons name="create-outline" size={13} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Đăng nhập</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={Colors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="example@demo.vn"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mật khẩu</Text>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={Colors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Đăng nhập</Text>
            )}
          </TouchableOpacity>

          <View style={styles.quickLoginSection}>
            <Text style={styles.quickLoginTitle}>Đăng nhập nhanh (Demo):</Text>
            <View style={styles.quickRow}>
              <TouchableOpacity
                style={[styles.quickBadge, { backgroundColor: '#f0fdfa' }]}
                onPress={() => handleQuick('PATIENT')}
                disabled={loading}
              >
                <Ionicons name="person" size={16} color={Colors.primary} />
                <Text style={[styles.quickText, { color: Colors.primary }]}>
                  Bệnh nhân
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickBadge, { backgroundColor: '#f0f9ff' }]}
                onPress={() => handleQuick('DOCTOR')}
                disabled={loading}
              >
                <Ionicons name="fitness" size={16} color={Colors.secondary} />
                <Text style={[styles.quickText, { color: Colors.secondary }]}>
                  Bác sĩ
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickBadge, { backgroundColor: '#fef2f2' }]}
                onPress={() => handleQuick('ADMIN')}
                disabled={loading}
              >
                <Ionicons name="shield-checkmark" size={16} color={Colors.danger} />
                <Text style={[styles.quickText, { color: Colors.danger }]}>
                  Admin
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.registerText}>
              Chưa có tài khoản?{' '}
              <Text style={{ color: Colors.primary, fontWeight: '700' }}>
                Đăng ký ngay
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Modal chỉnh sửa Server IP */}
        <Modal
          visible={showServerModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowServerModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Cấu hình Máy chủ Backend</Text>
              <Text style={styles.modalSub}>
                Nhập địa chỉ IP máy tính đang chạy Backend Express:
              </Text>

              <TextInput
                style={styles.modalInput}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
              />

              <View style={styles.quickIpRow}>
                <TouchableOpacity
                  style={styles.quickIpBtn}
                  onPress={() => setServerUrl('http://192.168.1.21:3001/api')}
                >
                  <Text style={styles.quickIpText}>192.168.1.21</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickIpBtn}
                  onPress={() => setServerUrl('http://10.0.2.2:3001/api')}
                >
                  <Text style={styles.quickIpText}>Android Emu</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => setShowServerModal(false)}
                >
                  <Text style={styles.modalCancelText}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSave}
                  onPress={handleSaveServer}
                >
                  <Text style={styles.modalSaveText}>Lưu & Áp dụng</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  subTitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  serverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryGhost,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 10,
    gap: 4,
  },
  serverBadgeText: {
    fontSize: 11,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: Colors.text,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  quickLoginSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  quickLoginTitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  quickText: {
    fontSize: 12,
    fontWeight: '600',
  },
  registerLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  registerText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
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
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    color: Colors.text,
  },
  quickIpRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickIpBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickIpText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: Colors.textMuted,
    fontWeight: '600',
  },
  modalSave: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '700',
  },
})
