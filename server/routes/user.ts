import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../authMiddleware';
import {
  pool,
  getUserByPrivyDid,
  getUserByEmail,
  getUserByUsername,
  setUsernameForUser,
  DbUser,
} from '../database';

const router = Router();

const USERNAME_REGEX = /^@[a-zA-Z0-9_]{3,29}$/;

const ensureDatabase = (res: any) => {
  if (!pool) {
    res.status(503).json({ error: 'Database is not configured. Please set DATABASE_URL.' });
    return false;
  }
  return true;
};

const sanitizeUserResponse = (user: DbUser) => ({
  id: user.id,
  privy_did: user.privy_did,
  email: user.email,
  wallet_address: user.wallet_address,
  username: user.username,
  created_at: user.created_at,
  updated_at: user.updated_at,
});

router.get('/username/check/:username', authenticateToken, async (req: AuthRequest, res) => {
  if (!ensureDatabase(res)) return;

  try {
    const { username } = req.params;

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        available: false,
        error: 'Username must start with @ and be 4-30 characters (letters, numbers, underscore).',
      });
    }

    const user = await getUserByUsername(username);

    res.json({
      available: !user,
      username,
    });
  } catch (error) {
    console.error('❌ Error checking username availability:', error);
    res.status(500).json({ error: 'Failed to check username availability' });
  }
});

router.post('/username/set', authenticateToken, async (req: AuthRequest, res) => {
  if (!ensureDatabase(res)) return;

  try {
    const { username } = req.body;
    const privy_did = req.userId;

    if (!privy_did) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        error: 'Invalid username format. Must start with @ and be 4-30 characters.',
      });
    }

    const currentUser = await getUserByPrivyDid(privy_did);

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (currentUser.username) {
      return res.status(400).json({
        error: 'Username already set',
        current_username: currentUser.username,
      });
    }

    const existing = await getUserByUsername(username);
    if (existing) {
      return res.status(409).json({
        error: 'Username already taken',
        available: false,
      });
    }

    const updatedUser = await setUsernameForUser(privy_did, username);

    if (!updatedUser) {
      return res.status(500).json({ error: 'Failed to set username' });
    }

    res.json({
      success: true,
      user: sanitizeUserResponse(updatedUser),
    });
  } catch (error: any) {
    console.error('❌ Error setting username:', error);
    if (error?.code === '23505') {
      return res.status(409).json({
        error: 'Username already taken',
        available: false,
      });
    }
    res.status(500).json({ error: 'Failed to set username' });
  }
});

router.post('/resolve-recipient', authenticateToken, async (req: AuthRequest, res) => {
  if (!ensureDatabase(res)) return;

  try {
    const rawIdentifier: string | undefined = req.body?.identifier;
    const identifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim() : '';

    if (!identifier) {
      return res.status(400).json({ error: 'Identifier required (email or @username)' });
    }

    let user: DbUser | null = null;

    if (identifier.startsWith('@')) {
      if (!USERNAME_REGEX.test(identifier)) {
        return res.status(400).json({ error: 'Invalid username format' });
      }
      user = await getUserByUsername(identifier);
    } else {
      user = await getUserByEmail(identifier.toLowerCase());
      if (!user) {
        user = await getUserByEmail(identifier);
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found', identifier });
    }

    res.json({
      email: user.email,
      wallet_address: user.wallet_address,
      username: user.username,
      privy_did: user.privy_did,
    });
  } catch (error) {
    console.error('❌ Error resolving recipient:', error);
    res.status(500).json({ error: 'Failed to resolve recipient' });
  }
});

router.get('/by-privy-did/:privyDid', authenticateToken, async (req: AuthRequest, res) => {
  if (!ensureDatabase(res)) return;

  try {
    const { privyDid } = req.params;

    if (!privyDid) {
      return res.status(400).json({ error: 'privyDid is required' });
    }

    const user = await getUserByPrivyDid(privyDid);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(sanitizeUserResponse(user));
  } catch (error) {
    console.error('❌ Error fetching user by Privy DID:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;

