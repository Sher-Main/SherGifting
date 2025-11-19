import { Resend } from 'resend';
import 'dotenv/config';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL;

if (!RESEND_API_KEY) {
  console.warn('⚠️ Warning: RESEND_API_KEY not set. Email notifications will not be sent.');
}

if (!FROM_EMAIL) {
  console.warn('⚠️ Warning: FROM_EMAIL not set in environment variables. Email notifications will not be sent.');
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface GiftNotificationParams {
  recipientEmail: string;
  senderEmail: string;      // User's email (for display only)
  senderName?: string;       // User's name (optional)
  amount: number;
  tokenSymbol: string;
  tokenName?: string;        // Token name (e.g., "Wrapped SOL")
  usdValue?: number | null;  // USD value of the gift
  claimUrl: string;
  message?: string;
}

export async function sendGiftNotification(params: GiftNotificationParams): Promise<{ success: boolean; error?: string; emailId?: string }> {
  if (!resend) {
    console.log('📧 Email not sent: Resend API key not configured');
    return { success: false, error: 'Email service not configured' };
  }

  if (!FROM_EMAIL) {
    console.log('📧 Email not sent: FROM_EMAIL not configured');
    return { success: false, error: 'FROM_EMAIL not set in environment variables' };
  }

  const { recipientEmail, senderEmail, senderName, amount, tokenSymbol, tokenName, usdValue, claimUrl, message } = params;

  // Validate email addresses
  if (!senderEmail || !recipientEmail) {
    return { success: false, error: 'Missing sender or recipient email' };
  }

  try {
    // ✅ Display sender name in subject (use name or email username)
    const senderDisplay = senderName || senderEmail.split('@')[0];

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You received a crypto gift!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold;">🎁 You Received a Gift!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.5;">
                Hello!
              </p>
              
              <!-- ✅ Highlight sender name -->
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.5;">
                <strong style="color: #0ea5e9; font-size: 18px;">${senderDisplay}</strong> 
                <span style="color: #6b7280;">has sent you a crypto gift!</span>
              </p>
              
              <!-- Gift Amount Box -->
              <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #0ea5e9; border-radius: 12px; padding: 24px; margin: 30px 0; text-align: center;">
                <p style="margin: 0 0 10px; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Gift Amount</p>
                ${usdValue !== null && usdValue !== undefined ? `
                  <p style="margin: 0; color: #0ea5e9; font-size: 42px; font-weight: bold;">$${usdValue.toFixed(3)} USD</p>
                  <p style="margin: 8px 0 0; color: #64748b; font-size: 18px; font-weight: 500;">${amount} ${tokenSymbol}${tokenName ? ` (${tokenName})` : ''}</p>
                ` : `
                  <p style="margin: 0; color: #0ea5e9; font-size: 36px; font-weight: bold;">${amount} ${tokenSymbol}${tokenName ? ` (${tokenName})` : ''}</p>
                `}
              </div>
              
              <!-- ✅ Show sender's email in smaller text -->
              <p style="margin: 0 0 20px; color: #9ca3af; font-size: 13px; text-align: center;">
                From: <span style="font-family: monospace; color: #6b7280;">${senderEmail}</span>
              </p>
              
              ${message ? `
              <div style="background-color: #f9fafb; border-left: 4px solid #0ea5e9; padding: 16px 20px; margin: 20px 0;">
                <p style="margin: 0 0 8px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Personal Message</p>
                <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.5; font-style: italic;">"${message}"</p>
              </div>
              ` : ''}
              
              <p style="margin: 30px 0 20px; color: #374151; font-size: 16px; line-height: 1.5;">
                Click the button below to claim your gift. It will be deposited directly into your wallet!
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${claimUrl}" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 6px rgba(14, 165, 233, 0.3);">
                      Claim Your Gift 🎁
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0; color: #9ca3af; font-size: 14px; line-height: 1.5;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${claimUrl}" style="color: #0ea5e9; text-decoration: underline; word-break: break-all;">${claimUrl}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">
                This gift link is secure and can only be claimed once.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Powered by Crypto Gifting • Solana Blockchain
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const textContent = `
You Received a Crypto Gift!

${senderDisplay} has sent you ${usdValue !== null && usdValue !== undefined ? `$${usdValue.toFixed(3)} USD (${amount} ${tokenSymbol})` : `${amount} ${tokenSymbol}`}!

From: ${senderEmail}

${message ? `Personal Message: "${message}"\n` : ''}

Claim your gift here: ${claimUrl}

This gift link is secure and can only be claimed once.

Powered by Crypto Gifting • Solana Blockchain
    `.trim();

    console.log('📧 Attempting to send email...');
    console.log('  From:', FROM_EMAIL);
    console.log('  To:', recipientEmail);
    console.log('  Reply-To:', senderEmail);
    console.log('  Subject:', `🎁 ${senderDisplay} sent you ${amount} ${tokenSymbol}!`);

    // Resend API uses { data, error } structure
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,  // ✅ Always your domain
      to: recipientEmail,
      replyTo: senderEmail, // ✅ Always set Reply-To to sender's email so recipients can reply
      subject: `🎁 ${senderDisplay} sent you ${usdValue !== null && usdValue !== undefined ? `$${usdValue.toFixed(3)} USD` : `${amount} ${tokenSymbol}`}!`,  // ✅ Sender's name in subject
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error('❌ Resend API Error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return { 
        success: false, 
        error: `Resend error: ${error.message || JSON.stringify(error)}` 
      };
    }

    if (!data) {
      console.error('❌ No data returned from Resend');
      return { 
        success: false, 
        error: 'No response data from email service' 
      };
    }

    console.log('✅ Email sent successfully!');
    console.log('📧 Email ID:', data.id);
    console.log('📧 Full response:', JSON.stringify(data, null, 2));

    return { 
      success: true, 
      emailId: data.id 
    };

  } catch (error: any) {
    console.error('❌ Exception in sendGiftNotification:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return { 
      success: false, 
      error: error?.message || 'Failed to send email' 
    };
  }
}
