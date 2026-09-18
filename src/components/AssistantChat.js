import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Bot, MessageCircle, Send, X } from "lucide-react-native";
import { askAssistant } from "../api/assistantApi";

const COLORS = {
  primary: "#147D76",
  primaryDark: "#0D625D",
  ink: "#101828",
  muted: "#667085",
  border: "#D9E1E5",
  background: "#F6F8F8",
  white: "#FFFFFF",
  danger: "#B42318",
};

export default function AssistantChat() {
  const [visible, setVisible] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  async function sendQuestion() {
    const value = question.trim();
    if (!value || loading) return;

    setQuestion("");
    setMessages((current) => [...current, { role: "user", text: value }]);
    setLoading(true);
    try {
      const data = await askAssistant(value);
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      setMessages((current) => [...current, {
        role: "assistant",
        text: data.answer || "I don't have enough verified data to answer that.",
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        error: true,
        text: error.response?.data?.error || "The assistant is unavailable right now.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  function askSuggestedQuestion(value) {
    setQuestion(value);
  }

  return (
    <>
      <Pressable
        accessibilityLabel="Open admin assistant"
        onPress={() => setVisible(true)}
        style={styles.floatingButton}
      >
        <MessageCircle size={22} color={COLORS.white} />
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.overlay}
        >
          <View style={styles.panel}>
            <View style={styles.header}>
              <View style={styles.headerIcon}><Bot size={20} color={COLORS.white} /></View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Admin assistant</Text>
                <Text style={styles.subtitle}>Answers from verified app data</Text>
              </View>
              <Pressable accessibilityLabel="Close admin assistant" onPress={() => setVisible(false)} style={styles.closeButton}>
                <X size={20} color={COLORS.ink} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled">
              {!messages.length ? (
                <View style={styles.emptyState}>
                  <Bot size={30} color={COLORS.primary} />
                  <Text style={styles.emptyTitle}>Ask about your dashboard</Text>
                  <Text style={styles.emptyText}>Try: Which tenants have pending rent?</Text>
                </View>
              ) : null}
              {messages.map((message, index) => (
                <View key={`${message.role}-${index}`} style={[styles.message, message.role === "user" ? styles.userMessage : styles.assistantMessage]}>
                  <Text style={[styles.messageText, message.role === "user" && styles.userMessageText, message.error && styles.errorText]}>{message.text}</Text>
                </View>
              ))}
              {loading ? <View style={styles.assistantMessage}><ActivityIndicator color={COLORS.primary} /></View> : null}
              {suggestions.length ? (
                <View style={styles.suggestions}>
                  <Text style={styles.suggestionsTitle}>Related questions</Text>
                  <View style={styles.suggestionList}>
                    {suggestions.map((suggestion) => (
                      <Pressable key={suggestion} onPress={() => askSuggestedQuestion(suggestion)} style={styles.suggestionButton}>
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                onSubmitEditing={sendQuestion}
                placeholder="Ask a question"
                placeholderTextColor={COLORS.muted}
                style={styles.input}
                returnKeyType="send"
                editable={!loading}
              />
              <Pressable accessibilityLabel="Send question" onPress={sendQuestion} disabled={loading || !question.trim()} style={[styles.sendButton, (!question.trim() || loading) && styles.sendButtonDisabled]}>
                <Send size={18} color={COLORS.white} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingButton: { position: "absolute", right: 18, bottom: 82, width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 26, backgroundColor: COLORS.primaryDark, elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16, 24, 40, 0.35)" },
  panel: { maxHeight: "82%", minHeight: 420, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: COLORS.background },
  header: { minHeight: 68, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.white },
  headerIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: COLORS.primary },
  headerCopy: { flex: 1, marginLeft: 10 },
  title: { color: COLORS.ink, fontSize: 16, fontWeight: "900" },
  subtitle: { marginTop: 2, color: COLORS.muted, fontSize: 11, fontWeight: "600" },
  closeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  messageList: { flexGrow: 1, padding: 16, gap: 10 },
  emptyState: { flex: 1, minHeight: 260, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 10, color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  emptyText: { marginTop: 5, color: COLORS.muted, fontSize: 12 },
  message: { maxWidth: "86%", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  userMessage: { alignSelf: "flex-end", backgroundColor: COLORS.primary },
  assistantMessage: { alignSelf: "flex-start", backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  messageText: { color: COLORS.ink, fontSize: 13, lineHeight: 19 },
  userMessageText: { color: COLORS.white },
  errorText: { color: COLORS.danger },
  suggestions: { marginTop: 4 },
  suggestionsTitle: { marginBottom: 7, color: COLORS.muted, fontSize: 11, fontWeight: "800" },
  suggestionList: { gap: 7 },
  suggestionButton: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#B8D9D5", borderRadius: 12, backgroundColor: "#EAF6F4" },
  suggestionText: { color: COLORS.primaryDark, fontSize: 11, fontWeight: "700" },
  inputRow: { padding: 12, paddingBottom: Platform.OS === "ios" ? 26 : 12, flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.white },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, color: COLORS.ink, backgroundColor: COLORS.background },
  sendButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.primary },
  sendButtonDisabled: { opacity: 0.45 },
});
