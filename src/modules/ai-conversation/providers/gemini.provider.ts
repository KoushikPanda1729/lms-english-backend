import { GoogleGenerativeAI } from "@google/generative-ai"
import { IAIVoiceProvider, AISessionToken, ChatMessage } from "./ai-voice.provider"
import { Config } from "../../../config/config"

export class GeminiProvider implements IAIVoiceProvider {
  private genAI = new GoogleGenerativeAI(Config.GEMINI_API_KEY)

  async createSessionToken(_systemPrompt: string): Promise<AISessionToken> {
    return { token: "gemini-text", serverUrl: "", mode: "text" }
  }

  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    })

    // history = all messages except the last
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }))

    const lastMsg = messages[messages.length - 1]
    if (!lastMsg) return ""

    const chatSession = model.startChat({ history })
    const result = await chatSession.sendMessage(lastMsg.text)
    return result.response.text()
  }
}
