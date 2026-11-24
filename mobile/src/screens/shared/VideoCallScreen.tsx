import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const VideoCallScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { targetName } = route.params || {}
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Remote Video Area */}
      <View style={styles.remoteVideo}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={60} color="#fff" />
        </View>
        <Text style={styles.remoteName}>{targetName || 'Đang kết nối...'}</Text>
        <Text style={styles.durationText}>{formatDuration(seconds)}</Text>
      </View>

      {/* Local Video Preview (Picture in Picture) */}
      <View style={styles.localPreview}>
        {videoOff ? (
          <View style={styles.cameraOffBox}>
            <Ionicons name="videocam-off" size={20} color="#fff" />
          </View>
        ) : (
          <View style={styles.cameraOnBox}>
            <Ionicons name="person" size={24} color="#94a3b8" />
            <Text style={styles.youText}>Bạn</Text>
          </View>
        )}
      </View>

      {/* Control Bar */}
      <View style={styles.controlBar}>
        <TouchableOpacity
          style={[styles.btnControl, muted && styles.btnControlActive]}
          onPress={() => setMuted(!muted)}
        >
          <Ionicons
            name={muted ? 'mic-off' : 'mic'}
            size={24}
            color={muted ? Colors.danger : '#fff'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnControl, videoOff && styles.btnControlActive]}
          onPress={() => setVideoOff(!videoOff)}
        >
          <Ionicons
            name={videoOff ? 'videocam-off' : 'videocam'}
            size={24}
            color={videoOff ? Colors.danger : '#fff'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnEndCall}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  remoteVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  remoteName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  durationText: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 6,
  },
  localPreview: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 90,
    height: 130,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraOffBox: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraOnBox: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  youText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
    gap: 24,
  },
  btnControl: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnControlActive: {
    backgroundColor: '#fff',
  },
  btnEndCall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
