import { IAIVoiceProvider, AISessionToken, ChatMessage } from "./ai-voice.provider"
import { Config } from "../../../config/config"

export class GroqProvider implements IAIVoiceProvider {
  async createSessionToken(_systemPrompt: string): Promise<AISessionToken> {
    return { token: "groq-text", serverUrl: "", mode: "text" }
  }

  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const body = {
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.text,
        })),
      ],
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Config.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Groq chat failed: ${err}`)
    }

    const data = (await response.json()) as { choices: { message: { content: string } }[] }
    return data.choices[0].message.content
  }
}
