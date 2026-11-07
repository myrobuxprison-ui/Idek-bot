const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
} = require('discord.js');
const config = require('../config');
const { isStaff, replyEphemeral, truncate } = require('../utils');
const { buildTranscript } = require('./transcript');

/*
 * Pas de base de données : les infos d'un ticket sont rangées dans le "sujet" (topic) du salon.
 * Format : ticket|owner:<id>|staff:<id>|logs:<id>|type:<clé>
 */
function buildTopic({ owner, staff, logs, type }) {
  return `ticket|owner:${owner}|staff:${staff}|logs:${logs}|type:${type}`;
}

function parseTopic(topic) {
  if (!topic?.startsWith('ticket|')) return null;
  const info = {};
  for (const part of topic.split('|').slice(1)) {
    const [key, value] = part.split(':');
    if (key && value) info[key] = value;
  }
  return info.owner ? info : null;
}

function getTicket(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return parseTopic(channel.topic);
}

function findOpenTicket(guild, userId) {
  return guild.channels.cache.find((c) => getTicket(c)?.owner === userId);
}

function slug(text) {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'member'
  );
}

const MEMBER_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

function ticketButtons({ claimedBy } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tk:claim')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🙋')
      .setLabel(claimedBy ? `Claimed by ${truncate(claimedBy, 40)}` : 'Claim')
      .setDisabled(Boolean(claimedBy)),
    new ButtonBuilder().setCustomId('tk:close').setStyle(ButtonStyle.Danger).setEmoji('🔒').setLabel('Close'),
  );
}

async function sendLog(guild, logsId, payload) {
  if (!logsId || logsId === '0') return;
  const channel = guild.channels.cache.get(logsId);
  if (!channel?.isTextBased()) return;
  await channel.send(payload).catch((err) => console.error('[tickets] Log failed:', err.message));
}

// ───────────────────────────── Ouverture ─────────────────────────────

/** Clic sur un bouton du panneau -> ouvre le formulaire. */
async function handleOpenButton(interaction, [typeKey, categoryId, staffId, logsId]) {
  const type = config.ticketTypes[typeKey];
  if (!type) return replyEphemeral(interaction, '❌ This ticket type no longer exists. Ask the staff to resend the panel.');

  const existing = findOpenTicket(interaction.guild, interaction.user.id);
  if (existing) return replyEphemeral(interaction, `❌ You already have an open ticket: ${existing}`);

  const modal = new ModalBuilder()
    .setCustomId(['tk', 'form', typeKey, categoryId, staffId, logsId].join(':'))
    .setTitle(truncate(`${type.emoji} ${type.label}`, 45));

  for (const q of type.questions.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(truncate(q.label, 45))
      .setStyle(q.style)
      .setRequired(q.required ?? true)
      .setMaxLength(q.maxLength ?? 1000);
    if (q.placeholder) input.setPlaceholder(truncate(q.placeholder, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return interaction.showModal(modal);
}

/** Formulaire envoyé -> création du salon privé. */
async function handleOpenForm(interaction, [typeKey, categoryId, staffId, logsId]) {
  const type = config.ticketTypes[typeKey];
  if (!type) return replyEphemeral(interaction, '❌ This ticket type no longer exists.');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { guild, user } = interaction;

  const existing = findOpenTicket(guild, user.id);
  if (existing) return interaction.editReply(`❌ You already have an open ticket: ${existing}`);

  const category = guild.channels.cache.get(categoryId);
  const staffRole = guild.roles.cache.get(staffId);

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: MEMBER_PERMS },
    { id: interaction.client.user.id, allow: [...MEMBER_PERMS, PermissionFlagsBits.ManageMessages] },
  ];
  if (staffRole) permissionOverwrites.push({ id: staffRole.id, allow: [...MEMBER_PERMS, PermissionFlagsBits.ManageMessages] });

  let channel;
  try {
    channel = await guild.channels.create({
      name: `${type.emoji}・${typeKey}-${slug(user.username)}`,
      type: ChannelType.GuildText,
      parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
      topic: buildTopic({ owner: user.id, staff: staffRole?.id || '0', logs: logsId || '0', type: typeKey }),
      permissionOverwrites,
      reason: `${type.label} ticket from ${user.tag}`,
    });
  } catch (err) {
    console.error('[tickets] Channel creation failed:', err);
    return interaction.editReply(
      '❌ Could not create the ticket. Make sure the bot has the **Manage Channels** and **Manage Roles** permissions.',
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0x00d4ff)
    .setTitle(`${type.emoji} Ticket — ${type.label}`)
    .setDescription(
      `Hey ${user}! Thanks for opening a ticket.\nA staff member will answer you as soon as possible.\n\n` +
        'To close this ticket, click **🔒 Close**.',
    )
    .setFooter({ text: `Opened by ${user.tag}`, iconURL: user.displayAvatarURL() })
    .setTimestamp();

  for (const q of type.questions) {
    const answer = interaction.fields.getTextInputValue(q.id)?.trim();
    if (answer) embed.addFields({ name: q.label, value: truncate(answer, 1024) });
  }

  await channel.send({
    content: `${user}${staffRole ? ` ${staffRole}` : ''}`,
    embeds: [embed],
    components: [ticketButtons()],
    allowedMentions: { users: [user.id], roles: staffRole ? [staffRole.id] : [] },
  });

  await sendLog(guild, logsId, {
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('📥 Ticket opened')
        .addFields(
          { name: 'Member', value: `${user} (${user.tag})`, inline: true },
          { name: 'Type', value: `${type.emoji} ${type.label}`, inline: true },
          { name: 'Channel', value: `${channel}`, inline: true },
        )
        .setTimestamp(),
    ],
  });

  return interaction.editReply(`✅ Your ticket has been created: ${channel}`);
}

// ───────────────────────────── Prise en charge ─────────────────────────────

async function handleClaim(interaction) {
  const info = getTicket(interaction.channel);
  if (!info) return replyEphemeral(interaction, '❌ This channel is not a ticket.');
  if (!isStaff(interaction.member, info.staff)) return replyEphemeral(interaction, '❌ Only staff can claim a ticket.');

  const embed = EmbedBuilder.from(interaction.message.embeds[0]).addFields({
    name: '🙋 Claimed by',
    value: `${interaction.user}`,
  });
  await interaction.update({ embeds: [embed], components: [ticketButtons({ claimedBy: interaction.user.username })] });
  return interaction.followUp({ content: `🙋 ${interaction.user} is now handling your ticket <@${info.owner}>!` });
}

// ───────────────────────────── Fermeture ─────────────────────────────

const closing = new Set();

async function closeTicket(channel, closedBy, reason) {
  if (closing.has(channel.id)) return false;
  closing.add(channel.id);

  try {
    const info = getTicket(channel);
    const type = config.ticketTypes[info.type];
    const owner = await channel.client.users.fetch(info.owner).catch(() => null);
    info.ownerTag = owner?.tag;

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🔒 Ticket closed by ${closedBy}${reason ? `\n**Reason:** ${reason}` : ''}\nDeleting in 5 seconds...`),
      ],
    });

    const transcript = await buildTranscript(channel, info).catch((err) => {
      console.error('[tickets] Transcript failed:', err);
      return null;
    });

    const summary = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🔒 Ticket closed')
      .addFields(
        { name: 'Member', value: owner ? `${owner} (${owner.tag})` : `<@${info.owner}>`, inline: true },
        { name: 'Type', value: type ? `${type.emoji} ${type.label}` : info.type, inline: true },
        { name: 'Closed by', value: `${closedBy}`, inline: true },
        { name: 'Channel', value: `#${channel.name}`, inline: true },
        { name: 'Messages', value: `${transcript?.count ?? '?'}`, inline: true },
        { name: 'Opened', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:f>`, inline: true },
      )
      .setTimestamp();
    if (reason) summary.addFields({ name: 'Reason', value: truncate(reason, 1024) });

    await sendLog(channel.guild, info.logs, { embeds: [summary], files: transcript ? [transcript.file] : [] });

    if (owner) {
      await owner
        .send({
          content: `Your ticket on **${channel.guild.name}** has been closed. Here is a copy of the conversation:`,
          embeds: [summary],
          files: transcript ? [transcript.file] : [],
        })
        .catch(() => {}); // MP fermés : pas grave
    }

    setTimeout(() => {
      channel.delete(`Ticket closed by ${closedBy.tag ?? closedBy.username}`).catch(() => {});
      closing.delete(channel.id);
    }, 5000);
    return true;
  } catch (err) {
    closing.delete(channel.id);
    throw err;
  }
}

function canClose(interaction, info) {
  return interaction.user.id === info.owner || isStaff(interaction.member, info.staff);
}

async function handleCloseButton(interaction) {
  const info = getTicket(interaction.channel);
  if (!info) return replyEphemeral(interaction, '❌ This channel is not a ticket.');
  if (!canClose(interaction, info)) return replyEphemeral(interaction, '❌ You can’t close this ticket.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tk:close-confirm').setStyle(ButtonStyle.Danger).setLabel('Yes, close'),
    new ButtonBuilder().setCustomId('tk:close-cancel').setStyle(ButtonStyle.Secondary).setLabel('Cancel'),
  );
  return interaction.reply({
    content: 'Are you sure you want to close this ticket?',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCloseConfirm(interaction) {
  const info = getTicket(interaction.channel);
  if (!info || !canClose(interaction, info)) {
    return interaction.update({ content: '❌ Action not allowed.', components: [] });
  }
  await interaction.update({ content: '🔒 Closing...', components: [] });
  await closeTicket(interaction.channel, interaction.user);
}

// ───────────────────────────── Routeur ─────────────────────────────

async function handle(interaction) {
  const [, action, ...args] = interaction.customId.split(':');

  if (interaction.isButton()) {
    if (action === 'open') return handleOpenButton(interaction, args);
    if (action === 'claim') return handleClaim(interaction);
    if (action === 'close') return handleCloseButton(interaction);
    if (action === 'close-confirm') return handleCloseConfirm(interaction);
    if (action === 'close-cancel') return interaction.update({ content: 'Closing cancelled.', components: [] });
  }
  if (interaction.isModalSubmit() && action === 'form') return handleOpenForm(interaction, args);
}

module.exports = { handle, getTicket, closeTicket, MEMBER_PERMS };
