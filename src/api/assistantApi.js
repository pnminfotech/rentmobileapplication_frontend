import { api } from "./client";

export async function askAssistant(question) {
  const { data } = await api.post("/assistant/ask", { question });
  return data;
}

export async function getAssistantQuestions() {
  const { data } = await api.get("/assistant/questions");
  return data;
}
