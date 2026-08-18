import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "authToken";
const USER_KEY = "authUser";

async function setItem(key, value) {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function getItem(key) {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function removeItem(key) {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function saveAuthSession({ token, user }) {
  await setItem(TOKEN_KEY, token);
  await setItem(USER_KEY, JSON.stringify(user || null));
}

export function getAuthToken() {
  return getItem(TOKEN_KEY);
}

export async function getAuthUser() {
  const raw = await getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearAuthSession() {
  await removeItem(TOKEN_KEY);
  await removeItem(USER_KEY);
}