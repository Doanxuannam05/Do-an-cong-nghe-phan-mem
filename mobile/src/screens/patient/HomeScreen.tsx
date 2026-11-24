import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../theme/colors'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'

// Tọa độ mặc định tại trung tâm Đà Nẵng
const DEFAULT_LAT = 16.0544
const DEFAULT_LNG = 108.2022

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth()
  const [specialties, setSpecialties] = useState<any[]>([])
  const [selectedSpecialty, setSelectedSpecialty] = useState<number | null>(null)
  const [radiusKm, setRadiusKm] = useState<number>(5)
  const [doctors, setDoctors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [specs, docs] = await Promise.all([
        api.getSpecialties(),
        api.getDoctors({
          lat: DEFAULT_LAT,
          lng: DEFAULT_LNG,
          radiusKm,
          specialtyId: selectedSpecialty || undefined,
          q: searchQuery || undefined,
        }),
      ])
      setSpecialties(Array.isArray(specs) ? specs : [])
      setDoctors(Array.isArray(docs) ? docs : docs?.items || docs?.doctors || [])
    } catch (err: any) {
      console.warn('Load home error:', err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [radiusKm, selectedSpecialty, searchQuery])

  useEffect(() => {
    loadData()
  }, [loadData])

  const onRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Xin chào,</Text>
          <Text style={styles.userName}>{user?.fullName || 'Người bệnh'}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-sharp" size={14} color={Colors.primary} />
            <Text style={styles.locationText}>Hải Châu, Đà Nẵng</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.notificationBtn}
          onPress={() => navigation.navigate('BookingsTab')}
        >
          <Ionicons name="notifications-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Banner "Khám ngay" (Grab-like CTA) */}
        <TouchableOpacity
          style={styles.onDemandBanner}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('OnDemand')}
        >
          <View style={styles.onDemandContent}>
            <View style={styles.urgentBadge}>
              <Ionicons name="flash" size={14} color="#f59e0b" />
              <Text style={styles.urgentText}>KHÁM NGAY TỨC THÌ</Text>
            </View>
            <Text style={styles.onDemandTitle}>Kết nối Bác sĩ gần bạn</Text>
            <Text style={styles.onDemandSub}>
              Hệ thống tự động tìm & ghép bác sĩ tối ưu trong 30 giây
            </Text>
            <View style={styles.onDemandBtn}>
              <Text style={styles.onDemandBtnText}>Yêu cầu kết nối</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </View>
          </View>
          <MaterialCommunityIcons
            name="doctor"
            size={90}
            color="rgba(255,255,255,0.2)"
            style={styles.bannerBgIcon}
          />
        </TouchableOpacity>

        {/* Quick Menu Cards */}
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate('Symptom')}
          >
            <View
              style={[styles.quickIconCircle, { backgroundColor: '#f0fdf4' }]}
            >
              <Ionicons name="sparkles" size={22} color={Colors.success} />
            </View>
            <Text style={styles.quickCardTitle}>Gợi ý AI</Text>
            <Text style={styles.quickCardDesc}>Nhận diện triệu chứng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate('BookingsTab')}
          >
            <View
              style={[styles.quickIconCircle, { backgroundColor: '#f0f9ff' }]}
            >
              <Ionicons name="calendar" size={22} color={Colors.secondary} />
            </View>
            <Text style={styles.quickCardTitle}>Lịch hẹn</Text>
            <Text style={styles.quickCardDesc}>Theo dõi ca khám</Text>
          </TouchableOpacity>
        </View>

        {/* Tìm kiếm */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên bác sĩ, phòng khám..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={loadData}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Chọn bán kính */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>Bán kính quét:</Text>
          <View style={styles.radiusPills}>
            {[1, 3, 5, 10].map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.radiusPill,
                  radiusKm === r && styles.radiusPillActive,
                ]}
                onPress={() => setRadiusKm(r)}
              >
                <Text
                  style={[
                    styles.radiusPillText,
                    radiusKm === r && styles.radiusPillTextActive,
                  ]}
                >
                  {r} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Chuyên khoa */}
        <View style={styles.specialtySection}>
          <Text style={styles.sectionTitle}>Chuyên khoa:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.specialtyList}
          >
            <TouchableOpacity
              style={[
                styles.specBadge,
                selectedSpecialty === null && styles.specBadgeActive,
              ]}
              onPress={() => setSelectedSpecialty(null)}
            >
              <Text
                style={[
                  styles.specBadgeText,
                  selectedSpecialty === null && styles.specBadgeTextActive,
                ]}
              >
                Tất cả
              </Text>
            </TouchableOpacity>
            {specialties.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.specBadge,
                  selectedSpecialty === s.id && styles.specBadgeActive,
                ]}
                onPress={() => setSelectedSpecialty(s.id)}
              >
                <Text
                  style={[
                    styles.specBadgeText,
                    selectedSpecialty === s.id && styles.specBadgeTextActive,
                  ]}
                >
                  {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Danh sách Bác sĩ */}
        <View style={styles.doctorSection}>
          <View style={styles.doctorSectionHeader}>
            <Text style={styles.sectionTitle}>
              Bác sĩ sẵn sàng ({doctors.length})
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator
              size="large"
              color={Colors.primary}
              style={{ marginTop: 24 }}
            />
          ) : !Array.isArray(doctors) || doctors.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons
                name="alert-circle-outline"
                size={40}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyText}>
                Không tìm thấy bác sĩ trong bán kính {radiusKm} km.
              </Text>
              <TouchableOpacity
                style={styles.expandRadiusBtn}
                onPress={() => setRadiusKm(10)}
              >
                <Text style={styles.expandRadiusText}>Mở rộng lên 10 km</Text>
              </TouchableOpacity>
            </View>
          ) : (
            doctors.map((doc) => (
              <TouchableOpacity
                key={doc.id || doc.doctorId}
                style={styles.docCard}
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate('DoctorDetail', {
                    doctorId: doc.id || doc.doctorId,
                  })
                }
              >
                <View style={styles.docAvatarCircle}>
                  <Text style={styles.docAvatarText}>
                    {(doc.fullName || 'BS').slice(0, 2).toUpperCase()}
                  </Text>
                  {doc.online && <View style={styles.onlineDot} />}
                </View>

                <View style={styles.docInfo}>
                  <View style={styles.docNameRow}>
                    <Text style={styles.docName}>{doc.fullName}</Text>
                    {doc.distanceKm != null && (
                      <View style={styles.distanceBadge}>
                        <Ionicons
                          name="navigate-outline"
                          size={11}
                          color={Colors.primary}
                        />
                        <Text style={styles.distanceText}>
                          {Number(doc.distanceKm).toFixed(1)} km
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.docSpec}>
                    {doc.specialtyName || doc.specialty?.name || 'Đa khoa'}
                  </Text>

                  <View style={styles.docMetrics}>
                    <View style={styles.metricItem}>
                      <Ionicons name="star" size={13} color="#f59e0b" />
                      <Text style={styles.metricValue}>
                        {doc.ratingAvg ? Number(doc.ratingAvg).toFixed(1) : '5.0'}
                      </Text>
                    </View>
                    <Text style={styles.metricDot}>•</Text>
                    <Text style={styles.metricExp}>
                      {doc.experienceYears || 5} năm KN
                    </Text>
                    <Text style={styles.metricDot}>•</Text>
                    <Text style={styles.docFee}>
                      {doc.consultationFee
                        ? `${Number(doc.consultationFee).toLocaleString(
                            'vi-VN'
                          )} đ`
                        : 'Miễn phí'}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Colors.border}
                />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greeting: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 3,
  },
  locationText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  notificationBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  onDemandBanner: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  onDemandContent: {
    zIndex: 1,
  },
  bannerBgIcon: {
    position: 'absolute',
    right: -10,
    bottom: -15,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 8,
  },
  urgentText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#d97706',
  },
  onDemandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  onDemandSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginVertical: 6,
    maxWidth: '85%',
  },
  onDemandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 6,
    gap: 6,
  },
  onDemandBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  quickCardDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  filterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  radiusPills: {
    flexDirection: 'row',
    gap: 6,
  },
  radiusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  radiusPillActive: {
    backgroundColor: Colors.primary,
  },
  radiusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  radiusPillTextActive: {
    color: '#fff',
  },
  specialtySection: {
    marginBottom: 16,
  },
  specialtyList: {
    gap: 8,
    paddingTop: 8,
  },
  specBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  specBadgeActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  specBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  specBadgeTextActive: {
    color: Colors.primaryDark,
  },
  doctorSection: {
    marginTop: 4,
  },
  doctorSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  docCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  docAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryGhost,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  docAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: '#fff',
  },
  docInfo: {
    flex: 1,
  },
  docNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 6,
  },
  docName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  distanceText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '700',
  },
  docSpec: {
    fontSize: 12,
    color: Colors.textMuted,
    marginVertical: 2,
  },
  docMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  metricDot: {
    color: Colors.textLight,
  },
  metricExp: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  docFee: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 10,
    textAlign: 'center',
  },
  expandRadiusBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  expandRadiusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
})
