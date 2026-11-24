import React, { useState } from 'react'
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

const SAMPLE_SYMPTOMS = [
  'Sốt cao, đau họng, ho có đờm',
  'Đau tức ngực, khó thở khi gắng sức',
  'Đau quặn bụng dưới, buồn nôn',
  'Mẩn đỏ, ngứa ngáy nổi mề đay',
  'Mắt đỏ, cộm xốn, chảy nước mắt',
]

export const SymptomScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any | null>(null)

  const handleAnalyze = async (inputStr?: string) => {
    const q = inputStr || text
    if (!q.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập mô tả triệu chứng của bạn')
      return
    }

    setLoading(true)
    try {
      const res = await api.suggestSpecialty({
        text: q.trim(),
        lat: DEFAULT_LAT,
        lng: DEFAULT_LNG,
      })
      setResult(res)
    } catch (err: any) {
      Alert.alert('Lỗi phân tích', err.message || 'Không thể kết nối dịch vụ AI')
    } finally {
      setLoading(false)
    }
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
        <Text style={styles.title}>Gợi ý Chuyên khoa AI</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mô tả triệu chứng của bạn</Text>
        <Text style={styles.cardSub}>
          Nhập cảm giác khó chịu hoặc chọn từ các mẫu bên dưới:
        </Text>

        <TextInput
          style={styles.inputArea}
          placeholder="Ví dụ: Bị sốt nhẹ 2 ngày nay, kèm đau rát họng khi nuốt..."
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={4}
        />

        <View style={styles.sampleChips}>
          {SAMPLE_SYMPTOMS.map((s, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.chip}
              onPress={() => {
                setText(s)
                handleAnalyze(s)
              }}
            >
              <Text style={styles.chipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.analyzeBtn, loading && { opacity: 0.7 }]}
          onPress={() => handleAnalyze()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.analyzeBtnText}>Phân tích & Gợi ý</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Kết quả phân tích */}
      {result && (
        <View style={styles.resultContainer}>
          {result.emergency && (
            <View style={styles.emergencyBox}>
              <Ionicons name="warning" size={24} color={Colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.emergencyTitle}>DẤU HIỆU CẤP CỨU</Text>
                <Text style={styles.emergencyText}>
                  {result.emergencyMessage}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.resultCard}>
            <Text style={styles.resultHeader}>Chuyên khoa khuyến nghị:</Text>

            <View style={styles.specialtyMatchRow}>
              <View style={styles.specIconBox}>
                <Ionicons name="medkit" size={26} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.specName}>
                  {result.specialty?.name || 'Đa khoa'}
                </Text>
                <Text style={styles.confidenceText}>
                  Độ tin cậy: {Math.round((result.confidence || 0.8) * 100)}%
                </Text>
              </View>
            </View>

            {result.matchedKeywords?.length > 0 && (
              <View style={styles.keywordsRow}>
                <Text style={styles.kwLabel}>Từ khóa nhận diện: </Text>
                {result.matchedKeywords.map((k: string, i: number) => (
                  <View key={i} style={styles.kwBadge}>
                    <Text style={styles.kwText}>{k}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                ⚠️ {result.disclaimer || 'Kết quả chỉ mang tính chất tham khảo, không thay thế chẩn đoán y khoa chính thức.'}
              </Text>
            </View>
          </View>

          {/* Bác sĩ gợi ý thuộc chuyên khoa này */}
          {result.doctors?.length > 0 && (
            <View style={styles.docListSection}>
              <Text style={styles.docListTitle}>
                Bác sĩ phù hợp gần bạn ({result.doctors.length})
              </Text>
              {result.doctors.map((d: any) => (
                <TouchableOpacity
                  key={d.id || d.doctorId}
                  style={styles.docItem}
                  onPress={() =>
                    navigation.navigate('DoctorDetail', {
                      doctorId: d.id || d.doctorId,
                    })
                  }
                >
                  <View style={styles.docAvatar}>
                    <Text style={styles.docAvatarTxt}>
                      {(d.fullName || 'BS').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docItemName}>{d.fullName}</Text>
                    <Text style={styles.docItemSub}>
                      {d.distanceKm ? `${Number(d.distanceKm).toFixed(1)} km • ` : ''}
                      {d.ratingAvg ? `${Number(d.ratingAvg).toFixed(1)}★` : '5.0★'}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.border}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 12,
  },
  inputArea: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sampleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  analyzeBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  analyzeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  resultContainer: {
    marginTop: 20,
  },
  emergencyBox: {
    flexDirection: 'row',
    backgroundColor: Colors.dangerLight,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecdd3',
    gap: 10,
    marginBottom: 14,
  },
  emergencyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.danger,
  },
  emergencyText: {
    fontSize: 12,
    color: '#9f1239',
    marginTop: 2,
    lineHeight: 16,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultHeader: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  specialtyMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 12,
  },
  specIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  confidenceText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '600',
    marginTop: 2,
  },
  keywordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 14,
    gap: 6,
  },
  kwLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  kwBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  kwText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: '600',
  },
  disclaimerBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  disclaimerText: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  docListSection: {
    marginTop: 18,
  },
  docListTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
  },
  docItem: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  docAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  docAvatarTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  docItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  docItemSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
})
