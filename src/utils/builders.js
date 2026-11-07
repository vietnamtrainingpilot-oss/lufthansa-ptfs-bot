/**
 * builders.js — shared Components V2 builders for ALL bot messages.
 *
 * RULE: No EmbedBuilder anywhere in this bot. Every message uses
 * ContainerBuilder / SectionBuilder / TextDisplayBuilder / ActionRowBuilder
 * with flags: MessageFlags.IsComponentsV2 (32768).
 *
 * NOTE ON STRUCTURE: the accent colour and the action row belong to the
 * CONTAINER (component type 17), not the section. A SectionBuilder only
 * supports Text Display children plus a single Button/Thumbnail accessory —
 * it has no setAccentColor, addComponent or addSeparatorComponents method, and
 * calling them throws a TypeError at runtime. Keep the hierarchy as
 * Container > (TextDisplay..., ActionRow).
 */

import {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SelectMenuBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from "discord.js";

export const FLAGS = MessageFlags.IsComponentsV2;
export const ACCENT_TICKET = 7392244; // blue
export const ACCENT_CAREER = 92807; // gold-ish

/**
 * Build a container with an accent colour, text blocks, and an optional row of
 * buttons or a select menu.
 *
 * @param {object} opts
 * @param {number} opts.accentColor
 * @param {string[]} opts.text — array of TextDisplay content strings
 * @param {object[]} opts.buttons — array of {label, style, customId, url?, emoji?}
 * @param {object} [opts.selectMenu] — {customId, placeholder, options, minValues, maxValues}
 * @returns {ContainerBuilder}
 */
export function buildContainer({ accentColor = ACCENT_TICKET, text = [], buttons = [], selectMenu = null }) {
  const container = new ContainerBuilder().setAccentColor(accentColor);

  for (const t of text) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t));
  }

  const needsRow = buttons.length > 0 || selectMenu;
  if (needsRow) {
    const row = new ActionRowBuilder();
    for (const b of buttons) {
      const btn = new ButtonBuilder()
        .setStyle(b.style)
        .setLabel(b.label)
        .setCustomId(b.customId);
      if (b.url) btn.setURL(b.url);
      if (b.emoji) btn.setEmoji(b.emoji);
      row.addComponents(btn);
    }
    if (selectMenu) {
      const menu = new SelectMenuBuilder()
        .setCustomId(selectMenu.customId)
        .setPlaceholder(selectMenu.placeholder)
        .setMinValues(selectMenu.minValues ?? 1)
        .setMaxValues(selectMenu.maxValues ?? 1);
      for (const opt of selectMenu.options || []) {
        menu.addOptions({
          label: opt.label,
          value: opt.value,
          description: opt.description,
        });
      }
      row.addComponents(menu);
    }
    container.addActionRowComponents(row);
  }

  return container;
}

/**
 * Build a full message payload (container + optional media gallery).
 *
 * @param {object} opts
 * @param {number} opts.accentColor
 * @param {string[]} opts.text
 * @param {object[]} opts.buttons
 * @param {object} opts.selectMenu
 * @param {string} opts.topImageUrl
 * @param {string} opts.bottomImageUrl
 * @returns {{flags: number, components: ContainerBuilder[]}}
 */
export function buildMessage({ accentColor, text, buttons, selectMenu, topImageUrl, bottomImageUrl }) {
  const containers = [];

  if (topImageUrl) {
    containers.push(
      new ContainerBuilder().addMediaGalleryComponents(
        new MediaGalleryBuilder().addMediaGalleryItemComponents(
          new MediaGalleryItemBuilder().setURL(topImageUrl)
        )
      )
    );
  }

  containers.push(
    buildContainer({ accentColor, text, buttons, selectMenu })
  );

  if (bottomImageUrl) {
    containers.push(
      new ContainerBuilder().addMediaGalleryComponents(
        new MediaGalleryBuilder().addMediaGalleryItemComponents(
          new MediaGalleryItemBuilder().setURL(bottomImageUrl)
        )
      )
    );
  }

  return { flags: FLAGS, components: containers };
}

/**
 * Build a simple confirmation message with Confirm/Cancel buttons.
 *
 * @param {string} title
 * @param {string} body
 * @param {string} confirmCustomId
 * @param {string} cancelCustomId
 * @param {number} accentColor
 * @returns {{flags: number, components: ContainerBuilder[]}}
 */
export function buildConfirm({
  title,
  body,
  confirmCustomId,
  cancelCustomId,
  accentColor = ACCENT_TICKET,
}) {
  return buildMessage({
    accentColor,
    text: [`### ${title}`, `> ${body}`],
    buttons: [
      { label: "Confirm", style: ButtonStyle.Danger, customId: confirmCustomId },
      { label: "Cancel", style: ButtonStyle.Secondary, customId: cancelCustomId },
    ],
  });
}

/**
 * Build a plain informational message (no buttons).
 *
 * @param {string} content
 * @param {number} accentColor
 * @returns {{flags: number, components: ContainerBuilder[]}}
 */
export function buildInfo(content, accentColor = ACCENT_TICKET) {
  return buildMessage({ accentColor, text: [content] });
}

/**
 * Build a message payload for a plain sentence — an error, confirmation, or
 * status line that carries no formatting of its own.
 *
 * WHY THIS EXISTS: once a message is sent with the Components V2 flag, Discord
 * ignores the `content` field entirely. Sending `{ flags: 32768, content: "..." }`
 * therefore produces an EMPTY message. Every plain-text reply must go through
 * this helper so the text is carried in a Text Display component instead.
 *
 * @param {string} content
 * @returns {{flags: number, components: ContainerBuilder[]}}
 */
export function buildText(content) {
  return {
    flags: FLAGS,
    components: [
      new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(String(content ?? ""))
      ),
    ],
  };
}

/**
 * Build a mention-safe text content. Discord will parse <@id> but we want
 * to display the user mention. Use the raw mention string from user.toString().
 *
 * @param {string} mention — e.g. "<@123456>"
 * @returns {string}
 */
export function mention(mention) {
  return mention;
}

export default {
  FLAGS,
  ACCENT_TICKET,
  ACCENT_CAREER,
  buildContainer,
  buildMessage,
  buildConfirm,
  buildInfo,
  buildText,
  mention,
};