import React, { useState } from 'react'
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
} from 'react-native'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { login } = useAuth()
  const [role, setRole] = useState<'PATIENT' | 'DOCTOR'>('PATIENT')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      Alert.alert('Lỗi', 'Vui lòng điền họ tên, email và mật khẩu')
      return
    }

    if (role === 'DOCTOR' && !licenseNumber.trim()) {
      Alert.alert('Lỗi', 'Bác sĩ cần cung cấp số chứng chỉ hành nghề')
      return
    }

    setLoading(true)
    try {
      const payload: any = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password,
        role,
      }
      if (role === 'DOCTOR') {
        payload.specialtyId = 1
        payload.licenseNumber = licenseNumber.trim()
        payload.experienceYears = 3
        payload.consultationFee = 200000
      }

      await api.register(payload)
      // Tự động đăng nhập
      await login(email.trim().toLowerCase(), password)
    } catch (err: any) {
      Alert.alert('Đăng ký thất bại', err.message || 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Tạo tài khoản</Text>
        </View>

        <View style={styles.roleSelector}>
          <TouchableOpacity
            style={[
              styles.roleOption,
              role === 'PATIENT' && styles.roleOptionActive,
            ]}
            onPress={() => setRole('PATIENT')}
          >
            <Ionicons
              name="person"
              size={18}
              color={role === 'PATIENT' ? '#fff' : Colors.textMuted}
            />
            <Text
              style={[
                styles.roleText,
                role === 'PATIENT' && styles.roleTextActive,
              ]}
            >
              Người bệnh
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.roleOption,
              role === 'DOCTOR' && styles.roleOptionActive,
            ]}
            onPress={() => setRole('DOCTOR')}
          >
            <Ionicons
              name="fitness"
              size={18}
              color={role === 'DOCTOR' ? '#fff' : Colors.textMuted}
            />
            <Text
              style={[
                styles.roleText,
                role === 'DOCTOR' && styles.roleTextActive,
              ]}
            >
              Bác sĩ
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Họ và tên *</Text>
            <TextInput
              style={styles.input}
              placeholder="Nguyễn Văn A"
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              placeholder="user@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Số điện thoại</Text>
            <TextInput
              style={styles.input}
              placeholder="0901234567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mật khẩu (tối thiểu 8 ký tự, có chữ & số) *</Text>
            <TextInput
              style={styles.input}
              placeholder="Mật khẩu"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {role === 'DOCTOR' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Số chứng chỉ hành nghề (CCHN) *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: 012345/DNA-CCHN"
                value={licenseNumber}
                onChangeText={setLicenseNumber}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Đăng ký ngay</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  roleSelector: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  roleOptionActive: {
    backgroundColor: Colors.primary,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  roleTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: '#fff',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})
