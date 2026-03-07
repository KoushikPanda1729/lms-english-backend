import { IAIVoiceProvider } from "./ai-voice.provider"
import { OpenAIProvider } from "./openai.provider"
import { GeminiProvider } from "./gemini.provider"
import { GroqProvider } from "./groq.provider"
import { Config } from "../../../config/config"
import logger from "../../../config/logger"

export function createAIVoiceProvider(): IAIVoiceProvider {
  const provider = Config.AI_PROVIDER

  switch (provider) {
    case "gemini":
      logger.info("AI Voice provider → Gemini")
      return new GeminiProvider()

    case "groq":
      logger.info("AI Voice provider → Groq (llama-3.1-8b-instant)")
      return new GroqProvider()

    case "openai":
    default:
      logger.info("AI Voice provider → OpenAI Chat")
      return new OpenAIProvider()
  }
}
