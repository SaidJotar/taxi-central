import { io } from "socket.io-client";

const URL_SOCKET = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export const socket = io(URL_SOCKET, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  withCredentials: true,
});

export function conectarSocketConToken(token) {
  socket.auth = { token };
  if (!socket.connected) {
    socket.connect();
  }
}