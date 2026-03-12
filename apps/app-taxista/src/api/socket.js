import { io } from "socket.io-client";

const URL_SOCKET = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export const socket = io(URL_SOCKET, {
  autoConnect: false,
  transports: ["polling"],
  withCredentials: true,
});