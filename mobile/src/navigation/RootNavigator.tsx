import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useAuth } from '../context/AuthContext'
import { Colors } from '../theme/colors'
import { Ionicons } from '@expo/vector-icons'

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen'
import { RegisterScreen } from '../screens/auth/RegisterScreen'
import { HomeScreen } from '../screens/patient/HomeScreen'
import { DoctorDetailScreen } from '../screens/patient/DoctorDetailScreen'
import { OnDemandScreen } from '../screens/patient/OnDemandScreen'
import { SymptomScreen } from '../screens/patient/SymptomScreen'
import { BookingsScreen } from '../screens/patient/BookingsScreen'
import { BookingDetailScreen } from '../screens/patient/BookingDetailScreen'
import { ProfileScreen } from '../screens/patient/ProfileScreen'
import { ChatScreen } from '../screens/shared/ChatScreen'
import { VideoCallScreen } from '../screens/shared/VideoCallScreen'
import { DoctorHomeScreen } from '../screens/doctor/DoctorHomeScreen'
import { DoctorBookingsScreen } from '../screens/doctor/DoctorBookingsScreen'
import { DoctorScheduleScreen } from '../screens/doctor/DoctorScheduleScreen'
import { DoctorProfileScreen } from '../screens/doctor/DoctorProfileScreen'
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen'
import { AdminDoctorsScreen } from '../screens/admin/AdminDoctorsScreen'
import { AdminUsersScreen } from '../screens/admin/AdminUsersScreen'
import { AdminSystemScreen } from '../screens/admin/AdminSystemScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// Patient Tabs
function PatientTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: Colors.border,
        },
        tabBarIcon: ({ focused, color }) => {
          let iconName: any = 'home'
          if (route.name === 'HomeTab') {
            iconName = focused ? 'home' : 'home-outline'
          } else if (route.name === 'OnDemandTab') {
            iconName = focused ? 'flash' : 'flash-outline'
          } else if (route.name === 'SymptomTab') {
            iconName = focused ? 'sparkles' : 'sparkles-outline'
          } else if (route.name === 'BookingsTab') {
            iconName = focused ? 'calendar' : 'calendar-outline'
          } else if (route.name === 'ProfileTab') {
            iconName = focused ? 'person' : 'person-outline'
          }
          return <Ionicons name={iconName} size={22} color={color} />
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ tabBarLabel: 'Khám phá' }}
      />
      <Tab.Screen
        name="OnDemandTab"
        component={OnDemandScreen}
        options={{ tabBarLabel: 'Khám ngay' }}
      />
      <Tab.Screen
        name="SymptomTab"
        component={SymptomScreen}
        options={{ tabBarLabel: 'Gợi ý AI' }}
      />
      <Tab.Screen
        name="BookingsTab"
        component={BookingsScreen}
        options={{ tabBarLabel: 'Lịch khám' }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Cá nhân' }}
      />
    </Tab.Navigator>
  )
}

// Doctor Tabs (Thanh điều hướng chuyên nghiệp dành riêng cho Bác sĩ)
function DoctorTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: Colors.border,
        },
        tabBarIcon: ({ focused, color }) => {
          let iconName: any = 'pulse'
          if (route.name === 'DoctorHomeTab') {
            iconName = focused ? 'pulse' : 'pulse-outline'
          } else if (route.name === 'DoctorBookingsTab') {
            iconName = focused ? 'calendar' : 'calendar-outline'
          } else if (route.name === 'DoctorScheduleTab') {
            iconName = focused ? 'time' : 'time-outline'
          } else if (route.name === 'DoctorProfileTab') {
            iconName = focused ? 'person' : 'person-outline'
          }
          return <Ionicons name={iconName} size={22} color={color} />
        },
      })}
    >
      <Tab.Screen
        name="DoctorHomeTab"
        component={DoctorHomeScreen}
        options={{ tabBarLabel: 'Tổng quan' }}
      />
      <Tab.Screen
        name="DoctorBookingsTab"
        component={DoctorBookingsScreen}
        options={{ tabBarLabel: 'Lịch khám' }}
      />
      <Tab.Screen
        name="DoctorScheduleTab"
        component={DoctorScheduleScreen}
        options={{ tabBarLabel: 'Lịch trực' }}
      />
      <Tab.Screen
        name="DoctorProfileTab"
        component={DoctorProfileScreen}
        options={{ tabBarLabel: 'Bác sĩ' }}
      />
    </Tab.Navigator>
  )
}

// Admin Tabs (Dành riêng cho Quản trị viên hệ thống MediGo)
function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: Colors.border,
        },
        tabBarIcon: ({ focused, color }) => {
          let iconName: any = 'grid'
          if (route.name === 'AdminDashboardTab') {
            iconName = focused ? 'grid' : 'grid-outline'
          } else if (route.name === 'AdminDoctorsTab') {
            iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline'
          } else if (route.name === 'AdminUsersTab') {
            iconName = focused ? 'people' : 'people-outline'
          } else if (route.name === 'AdminSystemTab') {
            iconName = focused ? 'hardware-chip' : 'hardware-chip-outline'
          }
          return <Ionicons name={iconName} size={22} color={color} />
        },
      })}
    >
      <Tab.Screen
        name="AdminDashboardTab"
        component={AdminDashboardScreen}
        options={{ tabBarLabel: 'Tổng quan' }}
      />
      <Tab.Screen
        name="AdminDoctorsTab"
        component={AdminDoctorsScreen}
        options={{ tabBarLabel: 'Duyệt Bác sĩ' }}
      />
      <Tab.Screen
        name="AdminUsersTab"
        component={AdminUsersScreen}
        options={{ tabBarLabel: 'Người dùng' }}
      />
      <Tab.Screen
        name="AdminSystemTab"
        component={AdminSystemScreen}
        options={{ tabBarLabel: 'Hệ thống' }}
      />
    </Tab.Navigator>
  )
}

export const RootNavigator: React.FC = () => {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: Colors.background,
        }}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // Auth flow
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : user.role === 'ADMIN' ? (
          // Admin flow (dành riêng cho Quản trị viên)
          <>
            <Stack.Screen name="AdminMainTabs" component={AdminTabs} />
            <Stack.Screen
              name="BookingDetail"
              component={BookingDetailScreen}
            />
            <Stack.Screen
              name="DoctorDetail"
              component={DoctorDetailScreen}
            />
          </>
        ) : user.role === 'DOCTOR' ? (
          // Doctor flow (có DoctorTabs)
          <>
            <Stack.Screen name="DoctorMainTabs" component={DoctorTabs} />
            <Stack.Screen
              name="BookingDetail"
              component={BookingDetailScreen}
            />
            <Stack.Screen
              name="DoctorDetail"
              component={DoctorDetailScreen}
            />
            <Stack.Screen name="OnDemand" component={OnDemandScreen} />
            <Stack.Screen name="Symptom" component={SymptomScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="VideoCall" component={VideoCallScreen} />
          </>
        ) : (
          // Patient flow (có PatientTabs)
          <>
            <Stack.Screen name="MainTabs" component={PatientTabs} />
            <Stack.Screen name="OnDemand" component={OnDemandScreen} />
            <Stack.Screen name="Symptom" component={SymptomScreen} />
            <Stack.Screen
              name="DoctorDetail"
              component={DoctorDetailScreen}
            />
            <Stack.Screen
              name="BookingDetail"
              component={BookingDetailScreen}
            />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="VideoCall" component={VideoCallScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
