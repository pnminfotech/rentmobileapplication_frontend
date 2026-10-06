import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { ArrowLeft, ShieldCheck } from "lucide-react-native";
import { getSecurityPinStatus, resetSecurityPin, saveSecurityPin } from "../../src/api/saasApi";

const validPin = (value) => /^\d{4,8}$/.test(value);

export default function SecurityScreen() {
  const router = useRouter();
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [password, setPassword] = useState("");
  const [resetMode, setResetMode] = useState(false);

  const load = useCallback(async () => { try { const data = await getSecurityPinStatus(); setConfigured(Boolean(data.configured)); } catch (err) { Alert.alert("Unable to load security", err.response?.data?.message || "Please try again."); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const digits = (value, setter) => setter(value.replace(/\D/g, "").slice(0, 8));

  async function submit() {
    if (!validPin(pin)) return Alert.alert("Invalid PIN", "Use a 4 to 8 digit PIN.");
    if (pin !== confirmPin) return Alert.alert("PINs do not match", "Enter the same PIN in both fields.");
    if (configured && !resetMode && !validPin(currentPin)) return Alert.alert("Current PIN required", "Enter your current security PIN.");
    if (resetMode && !password) return Alert.alert("Password required", "Enter your account password to reset the PIN.");
    try {
      setSaving(true);
      if (resetMode) await resetSecurityPin({ pin, password });
      else await saveSecurityPin({ pin, currentPin });
      setConfigured(true); setResetMode(false); setPin(""); setConfirmPin(""); setCurrentPin(""); setPassword("");
      Alert.alert("Security PIN saved", "Your PIN is now required for suspending, reactivating, and deleting items.");
    } catch (err) { Alert.alert("Unable to save PIN", err.response?.data?.message || "Please try again."); } finally { setSaving(false); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#006D9E" /></View>;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={24} color="#101828" /></Pressable><View><Text style={styles.eyebrow}>SAAS CONTROL CENTER</Text><Text style={styles.title}>Security PIN</Text></View></View>
    <View style={styles.hero}><ShieldCheck size={35} color="#006D9E" /><Text style={styles.heroTitle}>{configured ? "Security PIN enabled" : "Protect sensitive actions"}</Text><Text style={styles.heroText}>A PIN is required before an account can be suspended, activated, or a plan or referral can be deleted.</Text></View>
    <View style={styles.card}>
      {configured && !resetMode ? <><Text style={styles.label}>Current security PIN</Text><TextInput value={currentPin} onChangeText={(v) => digits(v, setCurrentPin)} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} /><Pressable onPress={() => { setResetMode(true); setCurrentPin(""); }}><Text style={styles.link}>Forgot your PIN? Reset using account password</Text></Pressable></> : resetMode ? <><Text style={styles.note}>Confirm your account password to reset this PIN.</Text><Text style={styles.label}>Account password</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry style={styles.input} /></> : null}
      <Text style={styles.label}>New security PIN</Text><TextInput value={pin} onChangeText={(v) => digits(v, setPin)} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} placeholder="4 to 8 digits" />
      <Text style={styles.label}>Confirm security PIN</Text><TextInput value={confirmPin} onChangeText={(v) => digits(v, setConfirmPin)} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} placeholder="Re-enter PIN" />
      <Pressable onPress={submit} disabled={saving} style={styles.save}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{configured ? "Update PIN" : "Set security PIN"}</Text>}</Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({ screen:{flex:1,backgroundColor:"#F6F8F8"},content:{padding:18,paddingBottom:42},loading:{flex:1,alignItems:"center",justifyContent:"center"},header:{minHeight:58,flexDirection:"row",alignItems:"center",gap:10,marginBottom:16},back:{width:42,height:42,alignItems:"center",justifyContent:"center"},eyebrow:{color:"#0087B7",fontSize:11,fontWeight:"900"},title:{color:"#101828",fontSize:26,fontWeight:"900"},hero:{padding:18,borderRadius:16,backgroundColor:"#E3F4FA"},heroTitle:{marginTop:10,color:"#101828",fontSize:18,fontWeight:"900"},heroText:{marginTop:5,color:"#475467",lineHeight:20},card:{marginTop:14,padding:16,borderWidth:1,borderColor:"#D9E8ED",borderRadius:16,backgroundColor:"#fff"},label:{marginTop:13,marginBottom:7,color:"#344054",fontWeight:"800"},input:{height:50,paddingHorizontal:13,borderWidth:1,borderColor:"#C9D8DE",borderRadius:11,color:"#101828",fontSize:16},link:{marginTop:11,color:"#006D9E",fontWeight:"800"},note:{color:"#667085",lineHeight:20},save:{height:52,marginTop:22,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:"#006D9E"},saveText:{color:"#fff",fontWeight:"900",fontSize:16} });
