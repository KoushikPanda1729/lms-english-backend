import { Repository } from "typeorm"
import { AIPersona, AIPersonaDifficulty } from "../../entities/AIPersona.entity"
import { AISession } from "../../entities/AISession.entity"
import { IAIVoiceProvider, ChatMessage } from "./providers/ai-voice.provider"
import { AIProvider } from "../../enums/ai-provider.enum"
import { NotFoundError, ValidationError } from "../../shared/errors"
import { Config } from "../../config/config"
import { StorageService } from "../../services/storage.service"

// ─── Default Personas ─────────────────────────────────────────────────────────

const DEFAULT_PERSONAS: Omit<AIPersona, "id" | "createdAt" | "updatedAt" | "usageCount">[] = [
  {
    name: "Casual Charlie",
    avatar: "😊",
    expertise: "Everyday Conversation",
    description: "Your friendly practice buddy for daily English chats. Perfect for beginners.",
    systemPrompt:
      "You are Charlie, a friendly and encouraging English conversation partner. Keep things relaxed and fun. Use simple vocabulary. Gently correct grammar mistakes by repeating the correct form naturally in your response. Ask follow-up questions to keep the conversation going. Focus on building confidence.",
    difficulty: "beginner",
    isPremium: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Grammar Grace",
    avatar: "📚",
    expertise: "Grammar Correction",
    description: "Patient grammar coach who helps you master English sentence structure.",
    systemPrompt:
      "You are Grace, a patient and clear English grammar teacher. When the user makes a grammar mistake, kindly point it out and explain the correct rule in simple terms. Give examples. Be encouraging and supportive. Focus on common grammar issues like tenses, articles, prepositions, and subject-verb agreement.",
    difficulty: "beginner",
    isPremium: false,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Story Sam",
    avatar: "📖",
    expertise: "Storytelling & Vocabulary",
    description: "Makes learning fun through interactive stories and creative conversations.",
    systemPrompt:
      "You are Sam, a creative storytelling English coach. Use stories and imaginative scenarios to teach vocabulary and expression. When the user struggles to find a word, suggest 2-3 options. Celebrate creative use of language. Keep the tone playful and engaging. Introduce one new interesting word or phrase per exchange.",
    difficulty: "beginner",
    isPremium: false,
    isActive: true,
    sortOrder: 3,
  },
  {
    name: "Business Brian",
    avatar: "💼",
    expertise: "Business English",
    description: "Master professional communication, emails, meetings, and presentations.",
    systemPrompt:
      "You are Brian, a seasoned business English coach with 15 years of corporate communication experience. Help the user practice professional vocabulary, formal email writing, meeting language, and presentation skills. Correct informal language and suggest more professional alternatives. Focus on real workplace scenarios.",
    difficulty: "intermediate",
    isPremium: false,
    isActive: true,
    sortOrder: 4,
  },
  {
    name: "Debate Coach David",
    avatar: "🎯",
    expertise: "Debate & Critical Thinking",
    description: "Sharpen your arguments and learn to speak confidently on any topic.",
    systemPrompt:
      "You are David, an experienced debate coach. Present a topic and challenge the user to argue their position. Counter their arguments thoughtfully to push them to think deeper. Teach them how to structure arguments (claim, evidence, reasoning), use transitional phrases, and speak with conviction. Correct weak reasoning and vague language.",
    difficulty: "advanced",
    isPremium: false,
    isActive: true,
    sortOrder: 5,
  },
  {
    name: "IELTS Instructor Iris",
    avatar: "🎓",
    expertise: "IELTS Preparation",
    description: "Targeted IELTS speaking practice to help you achieve your target band score.",
    systemPrompt:
      "You are Iris, an expert IELTS speaking examiner and coach. Conduct mock IELTS speaking tests with Part 1 (intro), Part 2 (cue card), and Part 3 (discussion) formats. Score responses on fluency, vocabulary, grammar, and pronunciation clarity. Give specific feedback after each part. Use official IELTS band descriptors.",
    difficulty: "intermediate",
    isPremium: false,
    isActive: true,
    sortOrder: 6,
  },
  {
    name: "Interview Coach Ivan",
    avatar: "🤝",
    expertise: "Job Interview Preparation",
    description: "Practice common interview questions and perfect your professional responses.",
    systemPrompt:
      "You are Ivan, a professional HR coach and interview specialist. Conduct mock job interviews. Ask common interview questions like 'Tell me about yourself', behavioral questions (STAR method), and situational questions. Give feedback on clarity, confidence, and content. Suggest better ways to phrase answers. Help with industry-specific vocabulary.",
    difficulty: "intermediate",
    isPremium: false,
    isActive: true,
    sortOrder: 7,
  },
  {
    name: "Accent Coach Amy",
    avatar: "🎙️",
    expertise: "American Accent & Pronunciation",
    description: "Improve your pronunciation and speak with a clear, confident American accent.",
    systemPrompt:
      "You are Amy, a professional accent and pronunciation coach specializing in American English. Focus on common pronunciation challenges, stress patterns, intonation, and connected speech. When the user types words, explain how to pronounce them phonetically. Give tips on mouth position and common mistakes. Practice tongue twisters and minimal pairs.",
    difficulty: "intermediate",
    isPremium: false,
    isActive: true,
    sortOrder: 8,
  },
  {
    name: "Travel Guide Tom",
    avatar: "✈️",
    expertise: "Travel English",
    description: "Learn essential English for airports, hotels, restaurants, and sightseeing.",
    systemPrompt:
      "You are Tom, a friendly travel English guide. Role-play common travel scenarios: checking in at an airport, booking a hotel, ordering food, asking for directions, shopping, and dealing with travel problems. Teach practical phrases and vocabulary for each situation. Keep it fun and scenario-based.",
    difficulty: "beginner",
    isPremium: false,
    isActive: true,
    sortOrder: 9,
  },
  {
    name: "News Anchor Nancy",
    avatar: "📰",
    expertise: "Formal Speaking & Public Communication",
    description:
      "Develop confident, clear formal speech skills for presentations and public speaking.",
    systemPrompt:
      "You are Nancy, a veteran news anchor and public speaking coach. Help the user practice formal speech, clear articulation, and structured communication. Give topics to summarize or present as if reporting news. Provide feedback on clarity, pace, word choice, and sentence structure. Teach formal vocabulary and transition phrases.",
    difficulty: "advanced",
    isPremium: false,
    isActive: true,
    sortOrder: 10,
  },
]

export class AIConversationService {
  constructor(
    private readonly personaRepo: Repository<AIPersona>,
    private readonly sessionRepo: Repository<AISession>,
    private readonly aiProvider: IAIVoiceProvider,
    private readonly storageService: StorageService,
  ) {}

  private signPersona(persona: AIPersona): AIPersona {
    if (persona.avatar.startsWith("http")) {
      persona.avatar = this.storageService.signIfNeeded(persona.avatar) ?? persona.avatar
    }
    return persona
  }

  // ─── Admin: Seed default personas ─────────────────────────────────────────

  async seedDefaultPersonas(): Promise<{ created: number; skipped: number }> {
    let created = 0
    let skipped = 0

    for (const p of DEFAULT_PERSONAS) {
      const exists = await this.personaRepo.findOne({ where: { name: p.name } })
      if (exists) {
        skipped++
        continue
      }
      await this.personaRepo.save(this.personaRepo.create(p))
      created++
    }

    return { created, skipped }
  }

  // ─── Admin: List all personas ──────────────────────────────────────────────

  async listPersonasAdmin(opts: {
    page: number
    limit: number
    isActive?: boolean
    difficulty?: AIPersonaDifficulty
    isPremium?: boolean
  }): Promise<{ personas: AIPersona[]; total: number; page: number; limit: number }> {
    const qb = this.personaRepo.createQueryBuilder("p")

    if (opts.isActive !== undefined)
      qb.andWhere("p.is_active = :isActive", { isActive: opts.isActive })
    if (opts.difficulty) qb.andWhere("p.difficulty = :difficulty", { difficulty: opts.difficulty })
    if (opts.isPremium !== undefined)
      qb.andWhere("p.is_premium = :isPremium", { isPremium: opts.isPremium })

    qb.orderBy("p.sort_order", "ASC")
      .addOrderBy("p.created_at", "DESC")
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit)

    const [personas, total] = await qb.getManyAndCount()
    personas.forEach((p) => this.signPersona(p))
    return { personas, total, page: opts.page, limit: opts.limit }
  }

  // ─── Admin: Get persona by id ──────────────────────────────────────────────

  async getPersonaById(id: string): Promise<AIPersona> {
    const persona = await this.personaRepo.findOne({ where: { id } })
    if (!persona) throw new NotFoundError("AI Persona not found")
    return this.signPersona(persona)
  }

  // ─── Admin: Create persona ─────────────────────────────────────────────────

  async createPersona(data: {
    name: string
    avatar: string
    expertise: string
    description: string
    systemPrompt: string
    difficulty: AIPersonaDifficulty
    isPremium: boolean
    sortOrder: number
  }): Promise<AIPersona> {
    const exists = await this.personaRepo.findOne({ where: { name: data.name } })
    if (exists) throw new ValidationError("A persona with this name already exists")

    const persona = this.personaRepo.create({ ...data, isActive: true, usageCount: 0 })
    return this.personaRepo.save(persona)
  }

  // ─── Admin: Update persona ─────────────────────────────────────────────────

  async updatePersona(
    id: string,
    data: Partial<{
      name: string
      avatar: string
      expertise: string
      description: string
      systemPrompt: string
      difficulty: AIPersonaDifficulty
      isPremium: boolean
      isActive: boolean
      sortOrder: number
    }>,
  ): Promise<AIPersona> {
    const persona = await this.personaRepo.findOne({ where: { id } })
    if (!persona) throw new NotFoundError("AI Persona not found")
    Object.assign(persona, data)
    const saved = await this.personaRepo.save(persona)
    return this.signPersona(saved)
  }

  // ─── Admin: Delete persona ─────────────────────────────────────────────────

  async deletePersona(id: string): Promise<void> {
    const persona = await this.getPersonaById(id)
    await this.personaRepo.remove(persona)
  }

  // ─── Admin: Usage stats ────────────────────────────────────────────────────

  async getAdminStats(): Promise<{
    totalSessions: number
    totalPersonas: number
    activePersonas: number
    topPersonas: { personaName: string; count: number }[]
  }> {
    const [totalSessions, totalPersonas, activePersonas] = await Promise.all([
      this.sessionRepo.count(),
      this.personaRepo.count(),
      this.personaRepo.count({ where: { isActive: true } }),
    ])

    const topPersonas = await this.sessionRepo
      .createQueryBuilder("s")
      .leftJoin("s.persona", "p")
      .select("p.name", "personaName")
      .addSelect("COUNT(s.id)", "count")
      .where("p.id IS NOT NULL")
      .groupBy("p.id")
      .addGroupBy("p.name")
      .orderBy("count", "DESC")
      .limit(5)
      .getRawMany()

    return {
      totalSessions,
      totalPersonas,
      activePersonas,
      topPersonas: topPersonas.map((r) => ({ personaName: r.personaName, count: Number(r.count) })),
    }
  }

  // ─── User: List active personas ────────────────────────────────────────────

  async listPersonasForUser(): Promise<AIPersona[]> {
    const personas = await this.personaRepo.find({
      where: { isActive: true },
      order: { sortOrder: "ASC", createdAt: "DESC" },
    })
    return personas.map((p) => this.signPersona(p))
  }

  // ─── User: Start AI session ────────────────────────────────────────────────

  async startSession(
    userId: string,
    personaId: string,
  ): Promise<{
    sessionId: string
    token: string
    serverUrl: string
    mode: "webrtc" | "text"
    systemPrompt: string
  }> {
    const persona = await this.personaRepo.findOne({ where: { id: personaId, isActive: true } })
    if (!persona) throw new NotFoundError("Persona not found or inactive")

    const tokenData = await this.aiProvider.createSessionToken(persona.systemPrompt)

    const session = this.sessionRepo.create({
      userId,
      personaId: persona.id,
      provider: Config.AI_PROVIDER as AIProvider,
      endedAt: null,
      durationSeconds: null,
    })
    const saved = await this.sessionRepo.save(session)

    await this.personaRepo.increment({ id: personaId }, "usageCount", 1)

    return {
      sessionId: saved.id,
      token: tokenData.token,
      serverUrl: tokenData.serverUrl,
      mode: tokenData.mode,
      systemPrompt: persona.systemPrompt,
    }
  }

  // ─── User: Text chat (Gemini text mode) ───────────────────────────────────

  async chat(personaId: string, messages: ChatMessage[]): Promise<string> {
    const persona = await this.getPersonaById(personaId)
    if (!this.aiProvider.chat)
      throw new ValidationError("Current AI provider does not support text chat")
    return this.aiProvider.chat(persona.systemPrompt, messages)
  }

  // ─── User: End AI session ──────────────────────────────────────────────────

  async endSession(sessionId: string, userId: string): Promise<AISession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId } })
    if (!session) throw new NotFoundError("Session not found")
    if (session.endedAt) return session

    const now = new Date()
    session.endedAt = now
    session.durationSeconds = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)
    return this.sessionRepo.save(session)
  }

  // ─── User: My session history ──────────────────────────────────────────────

  async getMyHistory(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ sessions: AISession[]; total: number }> {
    const [sessions, total] = await this.sessionRepo.findAndCount({
      where: { userId },
      relations: ["persona"],
      order: { startedAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    })
    return { sessions, total }
  }
}
