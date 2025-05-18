import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

// Define JwtPayload interface inline or import from a separate file
export interface JwtPayload {
  userId: number;
  role: string;
  iat?: number; 
  exp?: number; 
}

@Injectable()
export class AuthService {
  // Use environment variable for secret; fallback to a default (not recommended for prod)
  private readonly JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your-secret-key';

  // Token expiry duration
  private readonly JWT_EXPIRES_IN = '1h';

  /**
   * Generate a signed JWT token for a user.
   * @param userId - User's unique identifier
   * @param role - User's role (e.g. 'Patient', 'Practitioner')
   * @returns JWT token string
   */
  generateToken(userId: number, role: string): string {
    const payload: JwtPayload = { userId, role };
    return jwt.sign(payload, this.JWT_SECRET_KEY, { expiresIn: this.JWT_EXPIRES_IN });
  }

  /**
   * Validate and decode a JWT token.
   * @param token - JWT token string to validate
   * @returns Decoded JwtPayload if valid, otherwise null
   */
  validateToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET_KEY);
      // jwt.verify can return string or object
      if (typeof decoded === 'object' && decoded !== null) {
        return decoded as JwtPayload;
      }
      return null;
    } catch (error) {
      // Optionally log error here for debugging
      return null;
    }
  }

  /**
   * Optionally, a helper method to validate token and throw UnauthorizedException if invalid.
   * Useful in guards or controller validations.
   */
  verifyTokenOrThrow(token: string): JwtPayload {
    const decoded = this.validateToken(token);
    if (!decoded) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return decoded;
  }
}
