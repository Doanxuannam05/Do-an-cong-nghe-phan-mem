import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../theme/colors'
import { Ionicons } from '@expo/vector-icons'

export const ChatScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { bookingId, targetName } = route.params
  const { user } = useAuth()
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const flatListRef = useRef<FlatList>(null)

  const fetchMessages = async () => {
    try {
      const data = await api.getMessages(bookingId)
      setMessages(data || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMessages()
    const timer = setInterval(fetchMessages, 2500)
    return () => clearInterval(timer)
  }, [bookingId])

  const handleSend = async () => {
    if (!text.trim() || sending) return
    const msg = text.trim()
    setText('')
    setSending(true)

    // Optimistic UI update
    const tempMsg = {
      id: Date.now(),
      senderId: user?.id,
      content: msg,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMsg])

    try {
      await api.sendMessage(bookingId, msg)
      fetchMessages()
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{targetName || 'Phòng tư vấn'}</Text>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Trực tuyến</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.callIconBtn}
          onPress={() =>
            navigation.navigate('VideoCall', { bookingId, targetName })
          }
        >
          <Ionicons name="videocam" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) => String(item.id || index)}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          renderItem={({ item }) => {
            const isMe = item.senderId === user?.id || item.isMe
            return (
              <View
                style={[
                  styles.msgWrapper,
                  isMe ? styles.msgWrapperMe : styles.msgWrapperOther,
                ]}
              >
                <View
                  style={[
                    styles.msgBubble,
                    isMe ? styles.msgBubbleMe : styles.msgBubbleOther,
                  ]}
                >
                  <Text
                    style={[
                      styles.msgText,
                      isMe ? styles.msgTextMe : styles.msgTextOther,
                    ]}
                  >
                    {item.content || item.message}
                  </Text>
                  <Text
                    style={[
                      styles.msgTime,
                      isMe ? styles.msgTimeMe : styles.msgTimeOther,
                    ]}
                  >
                    {new Date(item.createdAt || Date.now()).toLocaleTimeString(
                      'vi-VN',
                      { hour: '2-digit', minute: '2-digit' }
                    )}
                  </Text>
                </View>
              </View>
            )
          }}
        />
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Nhập tin nhắn..."
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  backBtn: {
    padding: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  onlineText: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: '600',
  },
  callIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    padding: 16,
    paddingBottom: 20,
  },
  msgWrapper: {
    marginBottom: 10,
    flexDirection: 'row',
  },
  msgWrapperMe: {
    justifyContent: 'flex-end',
  },
  msgWrapperOther: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  msgBubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  msgTextMe: {
    color: '#fff',
  },
  msgTextOther: {
    color: Colors.text,
  },
  msgTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  msgTimeMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  msgTimeOther: {
    color: Colors.textMuted,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
    color: Colors.text,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
