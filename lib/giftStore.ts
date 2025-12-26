import { Bundle } from '../types';

const GIFT_STORAGE_KEY = 'sher_pending_gift';
const GIFT_EXPIRY_HOURS = 24;

/**
 * Pending gift data structure stored in localStorage before authentication
 */
export interface PendingGift {
  recipient: string;           // @username, wallet address, or email
  recipientType: 'username' | 'wallet' | 'email';
  token: string;               // Token symbol (e.g., 'USDC', 'SOL') or bundle ID
  amount: number;              // Amount in token units or USD (depending on token)
  message?: string;            // Optional gift message
  bundle?: Bundle;             // Bundle details if bundle was selected
  timestamp: number;           // When gift was created
  expiresAt: number;           // Expiry timestamp (24h from creation)
}

/**
 * Save pending gift to localStorage
 * Auto-sets expiry to 24 hours from now
 */
export function savePendingGift(gift: Omit<PendingGift, 'timestamp' | 'expiresAt'>): void {
  const now = Date.now();
  const expiresAt = now + (GIFT_EXPIRY_HOURS * 60 * 60 * 1000);
  
  const pendingGift: PendingGift = {
    ...gift,
    timestamp: now,
    expiresAt
  };
  
  try {
    localStorage.setItem(GIFT_STORAGE_KEY, JSON.stringify(pendingGift));
  } catch (error) {
    console.error('Failed to save pending gift to localStorage:', error);
  }
}

/**
 * Load pending gift from localStorage
 * Returns null if expired or doesn't exist
 */
export function loadPendingGift(): PendingGift | null {
  try {
    const stored = localStorage.getItem(GIFT_STORAGE_KEY);
    if (!stored) return null;
    
    const gift: PendingGift = JSON.parse(stored);
    
    // Check if expired
    if (Date.now() > gift.expiresAt) {
      clearPendingGift();
      return null;
    }
    
    return gift;
  } catch (error) {
    console.error('Failed to load pending gift:', error);
    clearPendingGift();
    return null;
  }
}

/**
 * Clear pending gift from localStorage
 */
export function clearPendingGift(): void {
  try {
    localStorage.removeItem(GIFT_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear pending gift from localStorage:', error);
  }
}

/**
 * Update pending gift (merge with existing)
 */
export function updatePendingGift(updates: Partial<PendingGift>): void {
  const existing = loadPendingGift();
  if (!existing) {
    console.warn('No pending gift to update');
    return;
  }
  
  // Preserve timestamp and expiresAt, update everything else
  const updated: PendingGift = {
    ...existing,
    ...updates,
    timestamp: existing.timestamp,
    expiresAt: existing.expiresAt
  };
  
  try {
    localStorage.setItem(GIFT_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to update pending gift:', error);
  }
}

