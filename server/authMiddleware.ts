import { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  throw new Error('Missing PRIVY_APP_ID or PRIVY_APP_SECRET in environment variables');
}

const privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the token with Privy
    const claims = await privyClient.verifyAuthToken(token);
    
    // Attach user ID to request
    req.userId = claims.userId;
    
    // Optionally fetch full user data
    const user = await privyClient.getUser(claims.userId);
    req.user = user;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};
