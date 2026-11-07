const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('See all bot commands'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x00d4ff)
      .setTitle('📖 Bot commands')
      .addFields(
        {
          name: '🖼️ Embeds (admin)',
          value:
            '`/embed create` — create an embed (title, text, image, thumbnail, color). A form opens so you can write multi-line text.\n' +
            '`/embed edit` — edit an embed already sent (paste the message link).',
        },
        {
          name: '🎫 Tickets (admin)',
          value: '`/ticket-panel` — send the panel with the buttons to open a ticket.',
        },
        {
          name: '🎫 Inside a ticket',
          value:
            '`/ticket add` / `/ticket remove` — manage members (staff)\n' +
            '`/ticket rename` — rename the channel (staff)\n' +
            '`/ticket close` — close the ticket (staff or creator)',
        },
        {
          name: '✍️ Formatting',
          value: '`**bold**`  `*italic*`  `__underline__`  `~~strike~~`  `# Big title`  `- list`  `> quote`',
        },
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
