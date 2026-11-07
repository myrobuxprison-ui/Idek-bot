require('dotenv').config();
const { ButtonStyle, TextInputStyle } = require('discord.js');

const env = (name) => (process.env[name] || '').trim();

module.exports = {
  token: env('DISCORD_TOKEN'),
  guildId: env('GUILD_ID'),
  staffRoleId: env('STAFF_ROLE_ID'),
  ticketCategoryId: env('TICKET_CATEGORY_ID'),
  ticketLogChannelId: env('TICKET_LOG_CHANNEL_ID'),
  embedColor: env('EMBED_COLOR') || '#00D4FF',
  status: env('BOT_STATUS') || 'commissions 🎨',

  /**
   * Types de tickets proposés sur le panneau.
   * - label / emoji / style : le bouton
   * - questions : le formulaire (5 questions max) qui s'ouvre au clic
   * Tu peux en ajouter, en enlever ou modifier les textes ici.
   */
  ticketTypes: {
    logo: {
      label: 'Order a logo',
      emoji: '🎨',
      style: ButtonStyle.Success,
      questions: [
        {
          id: 'details',
          label: 'Describe the logo you want',
          style: TextInputStyle.Paragraph,
          placeholder: 'Name, colors, character, style, text...',
          required: true,
        },
        {
          id: 'payment',
          label: 'Payment method',
          style: TextInputStyle.Short,
          placeholder: 'RBX or PayPal',
          required: true,
        },
        {
          id: 'references',
          label: 'References (image links)',
          style: TextInputStyle.Paragraph,
          placeholder: 'Optional: links to examples',
          required: false,
        },
      ],
    },
    question: {
      label: 'Question',
      emoji: '❓',
      style: ButtonStyle.Primary,
      questions: [
        {
          id: 'details',
          label: 'What is your question?',
          style: TextInputStyle.Paragraph,
          placeholder: 'Ask your question here...',
          required: true,
        },
      ],
    },
    support: {
      label: 'Support',
      emoji: '🛠️',
      style: ButtonStyle.Secondary,
      questions: [
        {
          id: 'details',
          label: 'Explain your issue',
          style: TextInputStyle.Paragraph,
          placeholder: 'Give as many details as possible...',
          required: true,
        },
      ],
    },
  },
};
