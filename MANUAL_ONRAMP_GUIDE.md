# Manual Onramp Transaction Guide

## Overview

Since Privy webhooks are a higher-tier feature, we use **polling** to detect onramp transactions. However, if a transaction was missed, you can manually add it to the database.

---

## Method 1: Using the Script (Recommended)

### Simple Mode (Easiest) ⭐

Just provide email, date, and USD amount - the script will automatically:
- Look up the user by email
- Get their wallet address
- Convert USD to SOL
- Add the transaction and credit

```bash
cd Gifting_App/solana-crypto-gifting/server
npx ts-node scripts/manual-add-onramp.ts <email> <date> <amount_usd>
```

**Arguments:**
- **email**: User email address (e.g., `kanth.miriyala@gmail.com`)
- **date**: ISO date string (e.g., `"2024-11-27T10:30:00Z"`)
- **amount_usd**: Amount in USD (e.g., `25.50`)

**Example:**
```bash
npx ts-node scripts/manual-add-onramp.ts \
  kanth.miriyala@gmail.com \
  "2024-11-27T10:30:00Z" \
  25.50
```

### Advanced Mode

If you need more control, use advanced mode:

```bash
npx ts-node scripts/manual-add-onramp.ts --advanced <user_id> <wallet_address> <amount_sol> [completed_date] [transaction_hash]
```

**Arguments:**
- **user_id**: Privy DID (e.g., `did:privy:cmao7x8ke00o0jw0ldutw1m70`)
- **wallet_address**: Solana wallet address
- **amount_sol**: Amount of SOL received (e.g., `0.1772`)
- **completed_date**: (Optional) ISO date string
- **transaction_hash**: (Optional) Solana transaction hash

**Example:**
```bash
npx ts-node scripts/manual-add-onramp.ts --advanced \
  did:privy:cmao7x8ke00o0jw0ldutw1m70 \
  9crByx6CTq9TarNFQfsK4gbbSoZ2rPSpXdRuJN32x1Bh \
  0.1772 \
  "2024-11-27T10:30:00Z"
```

### What the Script Does

1. ✅ Creates an `onramp_transaction` record in the database
2. ✅ Issues a $5 credit (or updates existing credit)
3. ✅ Marks transaction as credit issued
4. ✅ Transaction appears in History tab automatically

### Output

```
📝 Creating onramp transaction...
   User ID: did:privy:cmao7x8ke00o0jw0ldutw1m70
   Wallet: 9crByx6CTq9TarNFQfsK4gbbSoZ2rPSpXdRuJN32x1Bh
   Amount: 0.1772 SOL
   Completed Date: 2024-11-27T10:30:00.000Z
✅ OnrampTransaction created: onramp_tx_manual_1234567890_abc123
💚 OnrampCredit created: credit_manual_1234567890_def456
✅ $5 credit issued to user did:privy:cmao7x8ke00o0jw0ldutw1m70

🎉 Success! Transaction and credit have been added.
   Transaction ID: onramp_tx_manual_1234567890_abc123
   User can now send 5 free cards.
```

---

## Method 2: Using the API Endpoint

### Endpoint

```
POST /api/onramp/manual-add
```

### Authentication

Requires authentication token (Bearer token).

### Simple Mode Request Body

```json
{
  "email": "kanth.miriyala@gmail.com",
  "completedAt": "2024-11-27T10:30:00Z",
  "amountUSD": 25.50
}
```

### Advanced Mode Request Body

```json
{
  "userId": "did:privy:cmao7x8ke00o0jw0ldutw1m70",
  "walletAddress": "9crByx6CTq9TarNFQfsK4gbbSoZ2rPSpXdRuJN32x1Bh",
  "amountSOL": 0.1772,
  "completedAt": "2024-11-27T10:30:00Z",  // Optional, defaults to now
  "transactionHash": "5KJp8mN3vQ2xYz9aBcDeFgHiJkLmNoPqRsTuVwXyZ"  // Optional
}
```

### Example using curl (Simple Mode)

```bash
curl -X POST https://your-backend-domain.com/api/onramp/manual-add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "email": "kanth.miriyala@gmail.com",
    "completedAt": "2024-11-27T10:30:00Z",
    "amountUSD": 25.50
  }'
```

### Response

```json
{
  "success": true,
  "transactionId": "onramp_tx_manual_1234567890_abc123",
  "creditIssued": true,
  "message": "Transaction and credit added successfully"
}
```

---

## Method 3: Direct SQL (Advanced)

If you need to add transactions directly via SQL:

```sql
-- 1. Create transaction
INSERT INTO onramp_transactions (
  id, user_id, wallet_address, moonpay_status, amount_fiat, amount_crypto,
  credit_issued, completed_at, expires_at, idempotency_key, transaction_hash
) VALUES (
  'onramp_tx_manual_1234567890',
  'did:privy:cmao7x8ke00o0jw0ldutw1m70',
  '9crByx6CTq9TarNFQfsK4gbbSoZ2rPSpXdRuJN32x1Bh',
  'completed',
  26.58,  -- estimated fiat (0.1772 SOL * 150)
  0.1772, -- SOL amount
  false,
  '2024-11-27 10:30:00',  -- completed date
  NOW() + INTERVAL '30 days',
  'manual_1234567890',
  NULL  -- transaction hash (optional)
);

-- 2. Create or update credit
INSERT INTO onramp_credits (
  id, user_id, total_credits_issued, credits_remaining,
  card_adds_free_used, card_adds_allowed, expires_at, onramp_transaction_id
) VALUES (
  'credit_manual_1234567890',
  'did:privy:cmao7x8ke00o0jw0ldutw1m70',
  5.0, 5.0, 0, 5,
  NOW() + INTERVAL '30 days',
  'onramp_tx_manual_1234567890'
)
ON CONFLICT (user_id) DO UPDATE SET
  is_active = TRUE,
  credits_remaining = onramp_credits.credits_remaining + 5.0,
  card_adds_allowed = onramp_credits.card_adds_allowed + 5,
  updated_at = NOW();

-- 3. Mark transaction as credit issued
UPDATE onramp_transactions 
SET credit_issued = TRUE 
WHERE id = 'onramp_tx_manual_1234567890';
```

---

## How Transactions Are Fetched and Displayed

### Database Query Flow

1. **Transaction stored**:
   ```
   onramp_transactions table
   ```

2. **Frontend fetches**:
   ```typescript
   // HistoryPage.tsx
   GET /api/users/me/transaction-history
   ```

3. **Backend queries**:
   ```typescript
   // routes/onramp.ts
   const onrampTxs = await getOnrampTransactionsByUserId(userId);
   // SELECT * FROM onramp_transactions WHERE user_id = $1
   ```

4. **Displayed in History Tab**:
   - Shows in "Transactions" tab
   - Type: "💰 Added Funds (MoonPay)"
   - Amount: `+$XX.XX`
   - Credit badge: "✨ $5 Credit"
   - Status: "✓ Completed"
   - Date: formatted timestamp

### Credit Usage

- When user sends a gift with a card, `handleCardAdd` checks for active credit
- If credit exists, card is marked as FREE
- Credit usage tracked in `card_transactions` table

---

## Finding User Information

### Get User ID (Privy DID)

1. Check backend logs when user logs in
2. Query database:
   ```sql
   SELECT privy_did, wallet_address, email FROM users WHERE email = 'user@example.com';
   ```

### Get Wallet Address

1. Check user's profile in the app
2. Query database:
   ```sql
   SELECT wallet_address FROM users WHERE privy_did = 'did:privy:...';
   ```

### Calculate Amount

If you know the balance before and after:
```
amount_sol = balance_after - balance_before
```

Example:
- Before: 0.4238 SOL
- After: 0.6010 SOL
- Amount: 0.6010 - 0.4238 = **0.1772 SOL**

---

## Troubleshooting

### Transaction not showing in History?

1. Verify transaction was created:
   ```sql
   SELECT * FROM onramp_transactions WHERE user_id = 'did:privy:...';
   ```

2. Check that `user_id` matches the logged-in user

3. Refresh the History page

### Credit not issued?

1. Check if credit was created:
   ```sql
   SELECT * FROM onramp_credits WHERE user_id = 'did:privy:...';
   ```

2. Verify transaction is marked as credit issued:
   ```sql
   SELECT credit_issued FROM onramp_transactions WHERE id = '...';
   ```

### Duplicate transactions?

The script uses unique `idempotency_key` to prevent duplicates. If you need to add the same transaction again, use a different date or transaction hash.

---

## Notes

- **Date format**: Use ISO 8601 format (e.g., `"2024-11-27T10:30:00Z"`)
- **Credit expiry**: Credits expire after 30 days
- **Existing credits**: If user already has active credit, the script will add $5 to their existing credit instead of creating a new one
- **Fiat amount**: Automatically estimated as `amount_sol * 150` (rough SOL price)

