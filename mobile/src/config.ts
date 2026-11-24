import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const STORAGE_API_KEY = 'medigo.api_base_url'

// Tự động nhận diện URL theo môi trường
export function getDefaultApiUrl(): string {
  if (Platform.OS === 'web') {
    return 'http://localhost:3001/api'
  }
  // Cả iOS và Android máy thật đều cần IP Wi-Fi LAN của máy tính
  return 'http://192.168.1.21:3001/api'
}

let currentApiUrl = getDefaultApiUrl()

export async function initApiConfig(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_API_KEY)
    if (saved && (!saved.includes('localhost') || Platform.OS === 'web')) {
      currentApiUrl = saved
    } else {
      currentApiUrl = getDefaultApiUrl()
      await AsyncStorage.setItem(STORAGE_API_KEY, currentApiUrl)
    }
  } catch {
    currentApiUrl = getDefaultApiUrl()
  }
  return currentApiUrl
}

export function getApiBaseUrl(): string {
  return currentApiUrl
}

export async function setApiBaseUrl(url: string): Promise<void> {
  currentApiUrl = url.replace(/\/+$/, '')
  await AsyncStorage.setItem(STORAGE_API_KEY, currentApiUrl)
}
