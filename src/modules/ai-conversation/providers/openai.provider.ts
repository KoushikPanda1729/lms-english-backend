import { IAIVoiceProvider, AISessionToken, ChatMessage } from "./ai-voice.provider"
import { Config } from "../../../config/config"

export class OpenAIProvider implements IAIVoiceProvider {
  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.text,
        })),
      ],
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Config.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI chat failed: ${err}`)
    }

    const data = (await response.json()) as { choices: { message: { content: string } }[] }
    return data.choices[0].message.content
  }

  async createSessionToken(_systemPrompt: string): Promise<AISessionToken> {
    return { token: "openai-text", serverUrl: "", mode: "text" }
  }
}
