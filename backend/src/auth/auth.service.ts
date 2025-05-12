import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken'; // Correctly import jwt with proper type definitions
import { JwtPayload } from './jwt-payload.interface'; // Interface for payload (you can define this)

@Injectable()
export class AuthService {
  private readonly JWT_SECRET_KEY =
    process.env.JWT_SECRET_KEY || 'your-secret-key'; // Use environment variable in production

  /**
   * Generates a JWT token.
   *
   * @param userId The user's ID
   * @param role The user's role
   * @returns A JWT token
   */
  generateToken(userId: number, role: string): string {
    const payload: object = { userId, role };
    return jwt.sign(payload, this.JWT_SECRET_KEY, { expiresIn: '1h' });
  }

  /**
   * Validates a token.
   *
   * @param token The token string to validate
   * @returns Decoded user information if the token is valid, otherwise null
   */
  validateToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET_KEY);
      if (typeof decoded === 'object' && decoded !== null) {
        return decoded as JwtPayload;
      }
      return null;
      return typeof decoded === 'object' && decoded !== null
        ? (decoded as JwtPayload)
        : null;
    } catch {
      return null; 
    }
  }
}
