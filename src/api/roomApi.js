import { api } from "./client";

export async function getRooms() {
  const { data } = await api.get("/rooms");
  return data;
}

export async function createRoom(payload) {
  const { data } = await api.post("/rooms", payload);
  return data;
}

export async function addBed(roomId, payload) {
  const { data } = await api.post(`/rooms/${roomId}/bed`, payload);
  return data;
}

export async function updateBed(roomId, bedNo, payload) {
  const { data } = await api.put(
    `/rooms/${roomId}/bed/${encodeURIComponent(bedNo)}`,
    payload
  );
  return data;
}

export async function deleteBed(roomId, bedNo) {
  const { data } = await api.delete(`/rooms/${roomId}/bed/${encodeURIComponent(bedNo)}`);
  return data;
}

export async function addBeds(roomId, payload) {
  const { data } = await api.post(`/rooms/${roomId}/beds`, payload);
  return data;
}

export async function getUnitUsage() {
  const { data } = await api.get("/rooms/usage");
  return data;
}

export async function getUnit(roomId) {
  const { data } = await api.get(`/rooms/${roomId}`);
  return data;
}

export async function updateUnit(roomId, payload) {
  const { data } = await api.put(`/rooms/${roomId}`, payload);
  return data;
}

export async function deleteUnit(roomId) {
  const { data } = await api.delete(`/rooms/${roomId}`);
  return data;
}
