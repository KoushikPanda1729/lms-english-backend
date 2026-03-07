export interface AISessionToken {
  token: string
  serverUrl: string
  mode: "webrtc" | "text"
}

export interface ChatMessage {
  role: "user" | "model"
  text: string
}

export interface IAIVoiceProvider {
  createSessionToken(systemPrompt: string): Promise<AISessionToken>
  chat?(systemPrompt: string, messages: ChatMessage[]): Promise<string>
}
