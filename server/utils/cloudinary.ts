import { v2 as cloudinary } from 'cloudinary';
import 'dotenv/config';

// Configure Cloudinary
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.warn('⚠️ Warning: Cloudinary credentials not set. Card generation will not work.');
} else {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
  console.log('✅ Cloudinary configured successfully');
}

// Card template configuration matching frontend
interface CardTemplate {
  id: string;
  cloudinaryPublicId: string;
  textOverlayConfig: {
    fontFamily: string;
    fontSize: number;
    color: string;
    gravity: string;
    y: number;
  };
}

const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'thanksgiving',
    cloudinaryPublicId: 'Warm_Thanksgiving_greeting_card_with_pre-filled_seasonal_message_rymff5',
    textOverlayConfig: {
      fontFamily: 'Arial',
      fontSize: 48,
      color: '#FFFFFF',
      gravity: 'south',
      y: 100
    }
  },
  {
    id: 'newyear',
    cloudinaryPublicId: 'Warm_New_Year_greeting_card_with_pre-filled_seasonal_message_fm99yu',
    textOverlayConfig: {
      fontFamily: 'Arial',
      fontSize: 48,
      color: '#FFFFFF',
      gravity: 'south',
      y: 100
    }
  },
  {
    id: 'christmas',
    cloudinaryPublicId: 'Warm_Christmas_greeting_card_with_pre-filled_seasonal_message_pnrlzz',
    textOverlayConfig: {
      fontFamily: 'Arial',
      fontSize: 48,
      color: '#FFFFFF',
      gravity: 'south',
      y: 100
    }
  },
  {
    id: 'birthday',
    cloudinaryPublicId: 'Warm_Birthday_greeting_card_with_pre-filled_seasonal_message_zsjn44',
    textOverlayConfig: {
      fontFamily: 'Arial',
      fontSize: 48,
      color: '#FFFFFF',
      gravity: 'south',
      y: 100
    }
  }
];

/**
 * Generate a default greeting card URL (no personalization)
 * @param cardType - The type of card ('thanksgiving', 'newyear', 'christmas', 'birthday')
 * @param recipientName - Not used, kept for compatibility
 * @returns The Cloudinary URL for the default card
 */
export function generatePersonalizedCardUrl(
  cardType: string,
  recipientName: string
): string {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary credentials not configured');
  }

  const template = CARD_TEMPLATES.find(t => t.id === cardType);
  
  if (!template) {
    throw new Error(`Card template not found: ${cardType}`);
  }

  const { cloudinaryPublicId } = template;

  // Generate Cloudinary URL without text overlay (just default card)
  // Format: https://res.cloudinary.com/{cloud_name}/image/upload/{transformations}/{public_id}.jpg
  const transformations = [
    // Resize to standard email width
    `w_600`,
    `c_scale`,
    `q_auto:good`,
    `f_auto`
  ].join(',');

  const cardUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transformations}/${cloudinaryPublicId}.jpg`;

  return cardUrl;
}

