const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL ?? "";

export const API_BASE_URL = apiBaseUrl;
export const SOCKET_URL = socketUrl;

export function validateEnv() {
  if (!API_BASE_URL) {
    throw new Error("Falta EXPO_PUBLIC_API_BASE_URL");
  }

  if (!SOCKET_URL) {
    throw new Error("Falta EXPO_PUBLIC_SOCKET_URL");
  }
}