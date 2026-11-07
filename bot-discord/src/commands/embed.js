const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  InteractionContextType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { parseColor, imageFromUrl, isImage, replyEphemeral } = require('../utils');

const MODAL_TIMEOUT = 15 * 60 * 1000; // 15 minutes pour remplir le formulaire

const data = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Create or edit an embed (prices, info, rules...)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Create a new embed with an image')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel to send the embed in (default: here)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      )
      .addAttachmentOption((o) => o.setName('image').setDescription('Large image at the bottom of the embed'))
      .addAttachmentOption((o) => o.setName('thumbnail').setDescription('Small image at the top right'))
      .addStringOption((o) =>
        o.setName('color').setDescription('Hex (#00D4FF) or name: cyan, blue, red, green, purple, pink, orange...'),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('Edit an embed previously sent by the bot')
      .addStringOption((o) =>
        o.setName('message').setDescription('Message link (right click > Copy Message Link) or ID').setRequired(true),
      )
      .addAttachmentOption((o) => o.setName('image').setDescription('New large image'))
      .addAttachmentOption((o) => o.setName('thumbnail').setDescription('New thumbnail'))
      .addStringOption((o) => o.setName('color').setDescription('New color (hex or name)'))
      .addBooleanOption((o) => o.setName('remove_image').setDescription('Remove the large image'))
      .addBooleanOption((o) => o.setName('remove_thumbnail').setDescription('Remove the thumbnail')),
  );

function buildModal(customId, defaults = {}) {
  const title = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Title')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(256)
    .setPlaceholder('e.g. LOGO PRICES')
    .setRequired(false);
  const description = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description (bold: **text**)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setPlaceholder('**RBX**\n6k Tax Included\n\n**USD**\n$35 via PayPal')
    .setRequired(false);
  const footer = new TextInputBuilder()
    .setCustomId('footer')
    .setLabel('Footer (optional)')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(2048)
    .setRequired(false);

  if (defaults.title) title.setValue(defaults.title);
  if (defaults.description) description.setValue(defaults.description.slice(0, 4000));
  if (defaults.footer) footer.setValue(defaults.footer);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Embed content')
    .addComponents(
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(description),
      new ActionRowBuilder().addComponents(footer),
    );
}

/** Ouvre le formulaire et attend la réponse. Renvoie null si l'utilisateur ne valide pas à temps. */
async function askContent(interaction, defaults) {
  const modalId = `embed-modal:${interaction.id}`;
  await interaction.showModal(buildModal(modalId, defaults));
  try {
    const submit = await interaction.awaitModalSubmit({
      time: MODAL_TIMEOUT,
      filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
    });
    return {
      submit,
      title: submit.fields.getTextInputValue('title').trim(),
      description: submit.fields.getTextInputValue('description').trim(),
      footer: submit.fields.getTextInputValue('footer').trim(),
    };
  } catch {
    return null; // temps écoulé
  }
}

function checkImages(...attachments) {
  return attachments.every((a) => !a || isImage(a));
}

function missingPermissions(channel, me) {
  const needed = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
  ];
  const perms = channel.permissionsFor(me);
  return !perms || !perms.has(needed);
}

function parseMessageRef(input, fallbackChannelId) {
  const value = input.trim();
  const link = value.match(/channels\/(?:\d+|@me)\/(\d+)\/(\d+)/);
  if (link) return { channelId: link[1], messageId: link[2] };
  if (/^\d{17,20}$/.test(value)) return { channelId: fallbackChannelId, messageId: value };
  return null;
}

/** Si une erreur arrive après le formulaire, on la rattache au submit pour pouvoir répondre. */
async function withSubmit(submit, fn) {
  try {
    return await fn();
  } catch (cause) {
    throw Object.assign(new Error(cause.message), { submit, cause });
  }
}

const INVALID_COLOR = '❌ Invalid color. Example: `#00D4FF` or `cyan`.';

async function create(interaction) {
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const image = interaction.options.getAttachment('image');
  const thumbnail = interaction.options.getAttachment('thumbnail');
  const colorInput = interaction.options.getString('color');

  const color = colorInput ? parseColor(colorInput) : parseColor(config.embedColor);
  if (color === null) return replyEphemeral(interaction, INVALID_COLOR);
  if (!checkImages(image, thumbnail)) {
    return replyEphemeral(interaction, '❌ The image and thumbnail must be image files (png, jpg, gif, webp).');
  }
  if (missingPermissions(channel, interaction.guild.members.me)) {
    return replyEphemeral(
      interaction,
      `❌ I’m missing permissions in ${channel} (View Channel, Send Messages, Embed Links, Attach Files).`,
    );
  }

  const content = await askContent(interaction);
  if (!content) return;
  const { submit, title, description, footer } = content;

  if (!title && !description && !image) {
    return replyEphemeral(submit, '❌ The embed is empty: add at least a title, a description or an image.');
  }

  await submit.deferReply({ flags: MessageFlags.Ephemeral });
  return withSubmit(submit, async () => {
    const embed = new EmbedBuilder().setColor(color);
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (footer) embed.setFooter({ text: footer });

    const files = [];
    if (image) {
      const img = await imageFromUrl(image.url, 'image', image.name);
      files.push(img.file);
      embed.setImage(img.ref);
    }
    if (thumbnail) {
      const thumb = await imageFromUrl(thumbnail.url, 'thumbnail', thumbnail.name);
      files.push(thumb.file);
      embed.setThumbnail(thumb.ref);
    }

    const message = await channel.send({ embeds: [embed], files });
    return submit.editReply(`✅ Embed sent: ${message.url}`);
  });
}

async function edit(interaction) {
  const ref = parseMessageRef(interaction.options.getString('message'), interaction.channelId);
  if (!ref) {
    return replyEphemeral(interaction, '❌ Invalid message link or ID. Right click the message > **Copy Message Link**.');
  }

  const channel = await interaction.guild.channels.fetch(ref.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(ref.messageId).catch(() => null) : null;
  if (!message) return replyEphemeral(interaction, '❌ Message not found on this server.');
  if (message.author.id !== interaction.client.user.id || !message.embeds.length) {
    return replyEphemeral(interaction, '❌ I can only edit embeds that I sent myself.');
  }

  const newImage = interaction.options.getAttachment('image');
  const newThumbnail = interaction.options.getAttachment('thumbnail');
  const colorInput = interaction.options.getString('color');
  const removeImage = interaction.options.getBoolean('remove_image') ?? false;
  const removeThumbnail = interaction.options.getBoolean('remove_thumbnail') ?? false;

  const color = colorInput ? parseColor(colorInput) : undefined;
  if (color === null) return replyEphemeral(interaction, INVALID_COLOR);
  if (!checkImages(newImage, newThumbnail)) {
    return replyEphemeral(interaction, '❌ The image and thumbnail must be image files.');
  }

  const old = message.embeds[0];
  const content = await askContent(interaction, {
    title: old.title,
    description: old.description,
    footer: old.footer?.text,
  });
  if (!content) return;
  const { submit, title, description, footer } = content;

  await submit.deferReply({ flags: MessageFlags.Ephemeral });
  return withSubmit(submit, async () => {
    const embed = EmbedBuilder.from(old);
    embed.setTitle(title || null);
    embed.setDescription(description || null);
    embed.setFooter(footer ? { text: footer } : null);
    if (color !== undefined) embed.setColor(color);

    // On ré-uploade toutes les images (nouvelles ou anciennes) pour qu'elles n'expirent jamais.
    const files = [];
    const stamp = Date.now();
    const resolveImage = async (attachment, oldUrl, remove, baseName) => {
      if (attachment) return imageFromUrl(attachment.url, `${baseName}-${stamp}`, attachment.name);
      if (remove || !oldUrl) return null;
      return imageFromUrl(oldUrl, `${baseName}-${stamp}`);
    };

    const img = await resolveImage(newImage, old.image?.url, removeImage, 'image');
    const thumb = await resolveImage(newThumbnail, old.thumbnail?.url, removeThumbnail, 'thumbnail');
    embed.setImage(img ? img.ref : null);
    embed.setThumbnail(thumb ? thumb.ref : null);
    if (img) files.push(img.file);
    if (thumb) files.push(thumb.file);

    if (!title && !description && !img) {
      return submit.editReply('❌ The embed would be empty: add at least a title, a description or an image.');
    }

    await message.edit({ embeds: [embed], files, attachments: [] });
    return submit.editReply(`✅ Embed updated: ${message.url}`);
  });
}

module.exports = {
  data,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'create') return await create(interaction);
      if (sub === 'edit') return await edit(interaction);
    } catch (err) {
      // Après le formulaire, la réponse se fait sur le "submit" et non sur la commande.
      if (err.submit) {
        console.error('[embed]', err.cause);
        return err.submit.editReply(`❌ Error: ${err.cause.message}`).catch(() => {});
      }
      throw err;
    }
  },
};
