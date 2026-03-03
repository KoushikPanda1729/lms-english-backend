import { Request, Response, NextFunction } from "express"
import { verifyAccessToken } from "../modules/auth/jwt.util"

/**
 * Like authMiddleware but never rejects the request.
 * If a valid token is present, sets req.user; otherwise continues without it.
 * Use on public routes that want to personalise the response for logged-in users.
 */
export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    let token: string | undefined

    const authHeader = req.headers.authorization
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1]
    }

    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken as string
    }

    if (token) {
      const payload = await verifyAccessToken(token)
      req.user = { id: payload.sub, email: payload.email, role: payload.role }
    }
  } catch {
    // Invalid / expired token — just ignore and continue as unauthenticated
  }

  next()
}
