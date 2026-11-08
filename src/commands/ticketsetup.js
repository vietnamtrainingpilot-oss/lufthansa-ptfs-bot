/**
 * /ticketsetup — Posts the Main Menu message in the current channel.
 * Staff-only (cross-guild check via isStaffAuthorized).
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("ticketsetup")
  .setDescription("Post the ticket Main Menu message")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction, client) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({
      ...buildText("You do not have permission to use this command."),
      ephemeral: true,
    });
  }

  const {
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    SelectMenuBuilder,
  } = await import("discord.js");

  const components = [];

  if (config.ticketBannerTopUrl) {
    components.push(
      new ContainerBuilder().addMediaGalleryComponents(
        new MediaGalleryBuilder().addMediaGalleryItemComponents(
          new MediaGalleryItemBuilder().setURL(config.ticketBannerTopUrl)
        )
      )
    );
  }

  // Accent colour and the select menu both live on the CONTAINER (type 17).
  // A SectionBuilder cannot host an Action Row and has no accent colour.
  const container = new ContainerBuilder().setAccentColor(ACCENT.TICKET);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "# | Helpdesk\n**Need assistance?** Select the option below that best matches your enquiry.\n\n> * **General** — General questions and assistance\n> * **Partnership** — Partnership enquiries\n> * **Reports** — Report a member or issue\n> * **Fast Pass** — Fast Pass requests\n> * **Other** — Anything else"
    )
  );

  const row = new ActionRowBuilder();
  row.addComponents(
    new SelectMenuBuilder()
      .setCustomId("ticket_type_select")
      .setPlaceholder("Choose Support Type")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "General Support", value: "general", description: "General questions and assistance" },
        { label: "Partnership Inquiry", value: "partnership", description: "Partnership enquiries" },
        { label: "Fast Pass", value: "fastpass", description: "Fast Pass staff entry requests" },
        { label: "Report", value: "report", description: "Report a member or issue" },
        { label: "Other", value: "other", description: "Anything else" }
      )
  );
  container.addActionRowComponents(row);

  components.push(container);

  if (config.ticketBannerBottomUrl) {
    components.push(
      new ContainerBuilder().addMediaGalleryComponents(
        new MediaGalleryBuilder().addMediaGalleryItemComponents(
          new MediaGalleryItemBuilder().setURL(config.ticketBannerBottomUrl)
        )
      )
    );
  }

  await interaction.reply({ flags: 32768, components });
}