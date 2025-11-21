export interface CardTemplate {
  id: string;
  name: string;
  displayName: string;
  occasion: string;
  cloudinaryPublicId: string;
  previewUrl: string;
  defaultMessage: string;
  textOverlayConfig: {
    fontFamily: string;
    fontSize: number;
    color: string;
    gravity: string;
    y: number;
  };
}

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    displayName: 'Thanksgiving Card',
    occasion: 'Thanksgiving',
    cloudinaryPublicId: 'Warm_Thanksgiving_greeting_card_with_pre-filled_seasonal_message_rymff5',
    previewUrl: 'https://res.cloudinary.com/dvwgesrpc/image/upload/v1763687243/Warm_Thanksgiving_greeting_card_with_pre-filled_seasonal_message_rymff5.jpg',
    defaultMessage: 'Happy Thanksgiving!',
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
    name: 'New Year',
    displayName: 'New Year Card',
    occasion: 'New Year',
    cloudinaryPublicId: 'Warm_New_Year_greeting_card_with_pre-filled_seasonal_message_fm99yu',
    previewUrl: 'https://res.cloudinary.com/dvwgesrpc/image/upload/v1763687232/Warm_New_Year_greeting_card_with_pre-filled_seasonal_message_fm99yu.jpg',
    defaultMessage: 'Happy New Year!',
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
    name: 'Christmas',
    displayName: 'Christmas Card',
    occasion: 'Christmas',
    cloudinaryPublicId: 'Warm_Christmas_greeting_card_with_pre-filled_seasonal_message_pnrlzz',
    previewUrl: 'https://res.cloudinary.com/dvwgesrpc/image/upload/v1763687358/Warm_Christmas_greeting_card_with_pre-filled_seasonal_message_pnrlzz.jpg',
    defaultMessage: 'Merry Christmas!',
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
    name: 'Birthday',
    displayName: 'Birthday Card',
    occasion: 'Birthday',
    cloudinaryPublicId: 'Warm_Birthday_greeting_card_with_pre-filled_seasonal_message_zsjn44',
    previewUrl: 'https://res.cloudinary.com/dvwgesrpc/image/upload/v1763687221/Warm_Birthday_greeting_card_with_pre-filled_seasonal_message_zsjn44.jpg',
    defaultMessage: 'Happy Birthday!',
    textOverlayConfig: {
      fontFamily: 'Arial',
      fontSize: 48,
      color: '#FFFFFF',
      gravity: 'south',
      y: 100
    }
  }
];

export const CARD_UPSELL_PRICE = 0.00; // Free for testing

