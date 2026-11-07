const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  InteractionContextType,
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { parseColor, unescapeNewlines, imageFromUrl, isImage, replyEphemeral } = require('../utils');

const data = new SlashCommandBuilder()
  .setName('ticket-panel')
  .setDescription('Send the panel that lets members open a ticket')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addRoleOption((o) => o.setName('staff_role').setDescription('Role that can see and manage tickets'))
  .addChannelOption((o) =>
    o
      .setName('category')
      .setDescription('Category where tickets are created (auto-created if empty)')
      .addChannelTypes(ChannelType.GuildCategory),
  )
  .addChannelOption((o) =>
    o
      .setName('log_channel')
      .setDescription('Channel for ticket logs and transcripts')
      .addChannelTypes(ChannelType.GuildText),
  )
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Channel to send the panel in (default: here)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((o) => o.setName('title').setDescription('Panel title').setMaxLength(256))
  .addStringOption((o) =>
    o.setName('description').setDescription('Panel text (use \\n for a new line)').setMaxLength(4000),
  )
  .addAttachmentOption((o) => o.setName('image').setDescription('Panel image'))
  .addStringOption((o) => o.setName('color').setDescription('Hex (#00D4FF) or name'))
  .addStringOption((o) =>
    o
      .setName('types')
      .setDescription(`Buttons to show, comma separated (default: ${Object.keys(config.ticketTypes).join(',')})`),
  );

module.exports = {
  data,
  async execute(interaction) {
    const { guild } = interaction;
    const options = interaction.options;

    const staffRole = options.getRole('staff_role');
    const staffRoleId = staffRole?.id || config.staffRoleId;
    if (!staffRoleId || !guild.roles.cache.has(staffRoleId)) {
      return replyEphemeral(interaction, '❌ Pick a **staff_role** (or set the `STAFF_ROLE_ID` variable on Railway).');
    }

    const colorInput = options.getString('color');
    const color = parseColor(colorInput || config.embedColor);
    if (color === null) return replyEphemeral(interaction, '❌ Invalid color. Example: `#00D4FF` or `cyan`.');

    const image = options.getAttachment('image');
    if (image && !isImage(image)) return replyEphemeral(interaction, '❌ The file must be an image.');

    const typeKeys = (options.getString('types') || Object.keys(config.ticketTypes).join(','))
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => config.ticketTypes[t]);
    const types = [...new Set(typeKeys)].slice(0, 5);
    if (!types.length) {
      return replyEphemeral(
        interaction,
        `❌ No valid type. Available types: ${Object.keys(config.ticketTypes).map((t) => `\`${t}\``).join(', ')}`,
      );
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Catégorie : option > variable Railway > création automatique
    let category = options.getChannel('category');
    if (!category && config.ticketCategoryId) category = guild.channels.cache.get(config.ticketCategoryId) ?? null;
    if (!category) {
      category = await guild.channels.create({
        name: '🎫 Tickets',
        type: ChannelType.GuildCategory,
        reason: 'Ticket category',
      });
    }

    const logsChannel =
      options.getChannel('log_channel') ??
      (config.ticketLogChannelId ? guild.channels.cache.get(config.ticketLogChannelId) : null);

    const target = options.getChannel('channel') ?? interaction.channel;

    const defaultDescription = [
      'Need something? Click a button below to open a **private ticket** with the staff.',
      '',
      ...types.map((t) => `${config.ticketTypes[t].emoji} **${config.ticketTypes[t].label}**`),
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(options.getString('title') || '🎫 Open a ticket')
      .setDescription(unescapeNewlines(options.getString('description')) || defaultDescription);

    const files = [];
    if (image) {
      const img = await imageFromUrl(image.url, 'panel', image.name);
      files.push(img.file);
      embed.setImage(img.ref);
    }

    // Toute la config du ticket est stockée dans l'ID du bouton : pas besoin de base de données.
    const row = new ActionRowBuilder().addComponents(
      types.map((key) => {
        const type = config.ticketTypes[key];
        return new ButtonBuilder()
          .setCustomId(['tk', 'open', key, category.id, staffRoleId, logsChannel?.id || '0'].join(':'))
          .setLabel(type.label)
          .setEmoji(type.emoji)
          .setStyle(type.style);
      }),
    );

    const message = await target.send({ embeds: [embed], components: [row], files });
    return interaction.editReply(
      `✅ Panel sent: ${message.url}\n` +
        `• Category: **${category.name}**\n` +
        `• Staff: <@&${staffRoleId}>\n` +
        `• Logs: ${logsChannel ? `${logsChannel}` : '_none (transcripts will only be sent by DM)_'}`,
    );
  },
};
