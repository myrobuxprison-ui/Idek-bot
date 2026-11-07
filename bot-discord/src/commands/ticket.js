const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const { isStaff, replyEphemeral } = require('../utils');
const { getTicket, closeTicket, MEMBER_PERMS } = require('../tickets/handlers');

const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Manage the current ticket')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a member to the ticket')
      .addUserOption((o) => o.setName('member').setDescription('Member to add').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a member from the ticket')
      .addUserOption((o) => o.setName('member').setDescription('Member to remove').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('rename')
      .setDescription('Rename the ticket')
      .addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true).setMaxLength(90)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('close')
      .setDescription('Close the ticket')
      .addStringOption((o) => o.setName('reason').setDescription('Reason for closing').setMaxLength(500)),
  );

// Convertit un bit de permission en son nom ("ViewChannel"...) pour permissionOverwrites.edit
function permName(bit) {
  return Object.keys(PermissionFlagsBits).find((key) => PermissionFlagsBits[key] === bit);
}

module.exports = {
  data,
  async execute(interaction) {
    const channel = interaction.channel;
    const info = getTicket(channel);
    if (!info) return replyEphemeral(interaction, '❌ This command can only be used inside a ticket channel.');

    const sub = interaction.options.getSubcommand();
    const staff = isStaff(interaction.member, info.staff);
    const owner = interaction.user.id === info.owner;

    if (sub === 'close') {
      if (!staff && !owner) return replyEphemeral(interaction, '❌ You can’t close this ticket.');
      await interaction.reply('🔒 Closing the ticket...');
      return closeTicket(channel, interaction.user, interaction.options.getString('reason'));
    }

    if (!staff) return replyEphemeral(interaction, '❌ Only staff can use this command.');

    if (sub === 'add') {
      const user = interaction.options.getUser('member');
      await channel.permissionOverwrites.edit(user.id, Object.fromEntries(MEMBER_PERMS.map((p) => [permName(p), true])));
      return interaction.reply(`✅ ${user} has been added to the ticket.`);
    }

    if (sub === 'remove') {
      const user = interaction.options.getUser('member');
      if (user.id === info.owner) return replyEphemeral(interaction, '❌ You can’t remove the ticket creator.');
      await channel.permissionOverwrites.delete(user.id);
      return interaction.reply(`✅ ${user} has been removed from the ticket.`);
    }

    if (sub === 'rename') {
      const name = interaction.options.getString('name');
      await interaction.deferReply();
      // Discord limite le renommage à 2 fois toutes les 10 minutes par salon.
      const renamed = await Promise.race([
        channel.setName(name).then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
      ]);
      return interaction.editReply(
        renamed
          ? `✅ Ticket renamed to **${channel.name}**.`
          : '⏳ Discord limits renames (2 every 10 minutes). The name will change as soon as possible.',
      );
    }
  },
};
