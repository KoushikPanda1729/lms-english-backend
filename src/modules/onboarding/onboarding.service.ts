import { Repository } from "typeorm"
import { OnboardingQuestion } from "../../entities/OnboardingQuestion.entity"
import { Profile } from "../../entities/Profile.entity"
import { EnglishLevel } from "../../enums/index"
import { NotFoundError, ValidationError } from "../../shared/errors"

export class OnboardingService {
  constructor(
    private readonly questionRepo: Repository<OnboardingQuestion>,
    private readonly profileRepo: Repository<Profile>,
  ) {}

  // ─── GET /onboarding/questions (public — user takes test) ─────────────────

  async getActiveQuestions(): Promise<OnboardingQuestion[]> {
    return this.questionRepo.find({
      where: { isActive: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    })
  }

  // ─── POST /onboarding/complete ─────────────────────────────────────────────
  // Submits test answers, calculates level, saves profile fields

  async complete(
    userId: string,
    data: {
      displayName: string
      country: string
      nativeLanguage: string
      learningGoal: string
      answers: { questionId: string; selectedIndex: number }[]
    },
  ): Promise<{ englishLevel: EnglishLevel }> {
    let profile = await this.profileRepo.findOne({ where: { userId } })
    if (!profile) {
      profile = this.profileRepo.create({ userId })
    }

    // Score the test
    const englishLevel = await this.scoreTest(data.answers)

    profile.displayName = data.displayName
    profile.country = data.country
    profile.nativeLanguage = data.nativeLanguage
    profile.learningGoal = data.learningGoal as Profile["learningGoal"]
    profile.englishLevel = englishLevel
    profile.onboardingCompleted = true

    await this.profileRepo.save(profile)

    return { englishLevel }
  }

  // ─── Scoring logic ─────────────────────────────────────────────────────────

  private async scoreTest(
    answers: { questionId: string; selectedIndex: number }[],
  ): Promise<EnglishLevel> {
    if (!answers.length) return EnglishLevel.BEGINNER

    const ids = answers.map((a) => a.questionId)
    const questions = await this.questionRepo.findBy(ids.map((id) => ({ id })))

    const questionMap = new Map(questions.map((q) => [q.id, q]))
    let correct = 0

    for (const answer of answers) {
      const q = questionMap.get(answer.questionId)
      if (q && q.correctIndex === answer.selectedIndex) correct++
    }

    const pct = (correct / answers.length) * 100

    if (pct >= 80) return EnglishLevel.ADVANCED
    if (pct >= 60) return EnglishLevel.INTERMEDIATE
    if (pct >= 40) return EnglishLevel.ELEMENTARY
    return EnglishLevel.BEGINNER
  }

  // ─── Admin: list all questions ─────────────────────────────────────────────

  async adminList(): Promise<OnboardingQuestion[]> {
    return this.questionRepo.find({ order: { sortOrder: "ASC", createdAt: "ASC" } })
  }

  // ─── Admin: create question ────────────────────────────────────────────────

  async adminCreate(data: {
    question: string
    options: string[]
    correctIndex: number
    levelTag: EnglishLevel
    sortOrder?: number
  }): Promise<OnboardingQuestion> {
    if (data.options.length < 2) throw new ValidationError("At least 2 options required")
    if (data.correctIndex < 0 || data.correctIndex >= data.options.length) {
      throw new ValidationError("correctIndex out of range")
    }

    const q = this.questionRepo.create({
      question: data.question,
      options: data.options,
      correctIndex: data.correctIndex,
      levelTag: data.levelTag,
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
    })

    return this.questionRepo.save(q)
  }

  // ─── Admin: update question ────────────────────────────────────────────────

  async adminUpdate(
    id: string,
    data: {
      question?: string
      options?: string[]
      correctIndex?: number
      levelTag?: EnglishLevel
      sortOrder?: number
      isActive?: boolean
    },
  ): Promise<OnboardingQuestion> {
    const q = await this.questionRepo.findOne({ where: { id } })
    if (!q) throw new NotFoundError("Question not found")

    if (data.question !== undefined) q.question = data.question
    if (data.options !== undefined) q.options = data.options
    if (data.correctIndex !== undefined) q.correctIndex = data.correctIndex
    if (data.levelTag !== undefined) q.levelTag = data.levelTag
    if (data.sortOrder !== undefined) q.sortOrder = data.sortOrder
    if (data.isActive !== undefined) q.isActive = data.isActive

    return this.questionRepo.save(q)
  }

  // ─── Admin: delete question ────────────────────────────────────────────────

  async adminDelete(id: string): Promise<void> {
    const q = await this.questionRepo.findOne({ where: { id } })
    if (!q) throw new NotFoundError("Question not found")
    await this.questionRepo.remove(q)
  }
}
