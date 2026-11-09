# AERONEXUS

## Global Cloud Airline & Community Management Platform

### Product, Brand, UX, Functional, Architecture & Developer Specification

**Document ID:** ANX-SPEC-001\
**Version:** 1.0.0\
**Status:** Proposed product baseline for implementation planning\
**Product type:** Open-source-first, multi-tenant SaaS platform with
self-hosting support\
**Primary audience:** Product owners, human developers, AI coding
agents, contributors and operators\
**Initial reference implementation:** KLM PTFS\
**Working product name:** AeroNexus\
**Naming note:** AeroNexus is a working name. Complete trademark, domain
and package-name checks before public launch.

------------------------------------------------------------------------

# 0. HOW TO READ THIS SPECIFICATION

This document combines product requirements, user experience, brand
direction, functional behavior, technical architecture, security,
configuration contracts, operations and acceptance criteria.

Requirement labels:

-   **MUST**: mandatory for a conforming implementation.
-   **SHOULD**: strongly recommended; deviations must be documented.
-   **MAY**: optional capability.
-   **MVP**: required for the first usable release.
-   **Later**: planned after the initial stable release.

This is a product and technical specification, not a claim that the
described software already exists. Technology choices and implementation
details must be validated against the actual repository and deployment
environment before coding.

## 0.1 Source baseline and proposed expansion

The initial KLM PTFS functional overview supplies the baseline behavior
for support tickets, careers, flight operations, rewards, paid
promotions, two-server permissions, booking integration, audit records,
duplicate prevention and restart-safe scheduled work.

This specification preserves those behaviors while generalizing them for
many independent communities and adding the cloud onboarding, visual
configuration, extensibility, developer ecosystem and self-service SaaS
capabilities requested for the new product.

The KLM PTFS brief does not define a database schema, API payloads,
deployment commands or a complete technical architecture. Those are
proposed here as new design requirements, not represented as
requirements from the original brief.

------------------------------------------------------------------------

# 1. PRODUCT DEFINITION

## 1.1 Product vision

AeroNexus is a cloud-hosted airline and community operations platform. A
community owner signs up, creates an organization workspace, connects a
Discord server, configures their own airline identity and launches the
features they need from a web dashboard.

The platform combines:

1.  A shared cloud management service.
2.  A Discord bot and interaction layer.
3.  A staff-only web dashboard.
4.  A reusable module and automation system.
5.  A configuration studio for messages, forms, workflows and rewards.
6.  A documented API and extension ecosystem.
7.  An optional self-hosted deployment path.

AeroNexus must not be limited to KLM PTFS, aviation, Roblox or one
language. Aviation is the initial product specialization; the underlying
platform should support other Discord communities through modules and
terminology configuration.

## 1.2 Product promise

**Create your airline. Connect your Discord. Configure your operations.
Run everything from one dashboard.**

A new owner should not need to clone a repository, edit source code or
manually deploy a bot to use the hosted service.

The cloud onboarding flow should allow a user to:

1.  Create an account using Discord OAuth2.
2.  Create an organization/workspace.
3.  Choose an organization type, such as virtual airline or general
    community.
4.  Connect a Discord server where they have the required authority.
5.  Select an initial setup template or start from blank.
6.  Set their organization name, logo, colors, terminology and timezone.
7.  Configure owner and staff role IDs.
8.  Enable feature modules.
9.  Customize messages and forms.
10. Publish the bot's panels to chosen Discord channels.
11. Open the live dashboard and manage the organization.

## 1.3 Product principles

-   **Cloud-first, self-hostable:** The default experience is a hosted
    service. The open-source project must also provide a documented
    self-hosting path.
-   **Multi-tenant by design:** Many organizations share the service
    without sharing data.
-   **Configuration over code:** Routine customization must be possible
    in the dashboard.
-   **Composable modules:** Organizations enable only what they need.
-   **Discord-native interaction:** Members primarily use Discord; staff
    manage work in the dashboard.
-   **Portable configuration:** Organizations can export and migrate
    their configuration.
-   **Open extension model:** Third-party modules and integrations can
    be developed against documented contracts.
-   **Secure by default:** Authorization is checked server-side and
    scoped to an organization.
-   **Honest operations:** The system must never report an action as
    successful until the underlying operation succeeds.
-   **International by default:** Language, timezone, currency, number
    and date formatting are configurable.

## 1.4 Non-goals

The initial product is not:

-   An official airline service.
-   An official KLM Royal Dutch Airlines service.
-   An integration with Flying Blue.
-   A real-world airline reservation or dispatch system.
-   A payment processor for Roblox purchases.
-   A replacement for Discord.
-   A general-purpose arbitrary-code hosting service.
-   A system that silently detects AI-written applications or makes
    hiring decisions automatically.

------------------------------------------------------------------------

# 2. BRAND IDENTITY

## 2.1 Brand name

**AeroNexus**

Meaning: - **Aero** communicates aviation and virtual airlines. -
**Nexus** communicates a connected operating hub for people, workflows,
data and services.

The name should still make sense if the platform expands beyond
airlines.

## 2.2 Tagline

Primary: **Your airline. One control center.**

Alternative product copy: - Connect your community. Run your
operations. - Everything behind your airline, in one place. - From
Discord server to fully managed virtual airline.

## 2.3 Brand personality

-   Professional, capable and modern.
-   Aviation-inspired without looking like an airline booking website.
-   Technical enough for developers, approachable enough for volunteer
    community owners.
-   Clear and calm rather than overly futuristic.
-   Premium through spacing, typography, interaction quality and
    consistency---not excessive gradients or glass effects.

## 2.4 Visual identity

### Core palette

  Token           Hex         Usage
  --------------- ----------- --------------------------------------------
  Midnight Navy   `#0B1730`   Main brand background, dark navigation
  Aviation Blue   `#2563EB`   Primary actions and links
  Sky Cyan        `#45B8FF`   Highlights, active states and data accents
  Aero Teal       `#35C9B2`   Success and positive operational states
  Cloud White     `#F7F9FC`   Light page background
  Slate           `#64748B`   Secondary text
  Amber           `#F5A94A`   Warnings and attention
  Signal Red      `#DC5353`   Errors and destructive states
  Border          `#E2E8F0`   Light-mode borders

Use semantic design tokens rather than hardcoding colors in individual
components. Support dark and light themes.

### Typography

Recommended: - **Headings:** Manrope or Inter. - **Body/UI:** Inter. -
**Monospace/code:** JetBrains Mono.

Use a consistent type scale, readable line lengths and accessible
contrast. The final font choice must be checked for licensing and web
performance.

### Logo direction

Create a simple geometric mark combining: - A forward-moving
aircraft/wing suggestion. - A connected-node or route junction motif. -
A compact silhouette that works at 16--32 px. - A wordmark reading
AERONEXUS.

Avoid copying airline logos, Discord branding or Milo's mascot. The mark
must be original and usable in monochrome.

### Logo variants

1.  Primary horizontal wordmark.
2.  Standalone icon.
3.  Dark-background version.
4.  Light-background version.
5.  Single-color version.
6.  Small Discord bot avatar.
7.  Favicon/app icon.

### UI style

-   Clean SaaS layout.
-   Deep navy sidebar or restrained light sidebar.
-   White or near-white content surfaces.
-   Strong page hierarchy.
-   Compact but comfortable data tables.
-   Clear status chips.
-   Useful empty states.
-   Consistent iconography.
-   Subtle shadows and borders.
-   Minimal animation; respect reduced-motion preferences.

## 2.5 Organization branding

Each organization may configure its own: - Organization display name. -
Short name. - Logo. - Cover/banner image. - Primary and accent colors. -
Custom terminology. - Custom bot embed identity (message branding
only). - Footer text. - Custom emoji references. - Public-facing welcome
and panel messages.

Important Discord limitation: one shared Discord bot application has one
global bot username and avatar. It cannot have a different actual bot
identity per guild. Per-organization branding must be applied to embeds,
messages, panels and dashboard UI. If a deployment supports dedicated
customer-owned bot applications, that must be an explicit advanced
deployment option with separate credentials and operational
implications.

------------------------------------------------------------------------

# 3. USERS, ACCOUNTS AND ORGANIZATIONS

## 3.1 Identity model

Separate these concepts:

-   **User account:** A human identity authenticated through Discord
    OAuth2.
-   **Organization:** A customer workspace, such as an airline or
    community.
-   **Installation:** The connection between an organization and a
    Discord guild/bot deployment.
-   **Membership:** A user's access to an organization dashboard.
-   **Discord member:** A Discord identity inside a connected guild.
-   **Role mapping:** A mapping between Discord role IDs and platform
    permissions.

One user may belong to multiple organizations. One organization may have
multiple installations if explicitly supported. Do not assume one
Discord account equals one organization.

## 3.2 Account signup

MVP authentication: - Discord OAuth2 authorization-code flow. - State
validation and CSRF protection. - Secure session handling. - Minimal
scopes required for identity. - Revalidation of access where required. -
Account disconnect and session revocation.

Do not request broad Discord permissions without a documented reason.

## 3.3 Organization creation wizard

### Step 1 --- Create workspace

Fields: - Organization name. - Unique workspace slug. - Organization
type. - Default language. - Timezone. - Country/region (optional; used
for formatting only unless needed).

### Step 2 --- Connect Discord

-   Show guilds the authenticated user can administer, based on Discord
    authorization data.
-   Let the user select a guild.
-   Start the bot installation/authorization flow.
-   Verify the bot joined the selected guild.
-   Verify required bot permissions and intents.
-   Display missing permissions clearly.

### Step 3 --- Create the organization profile

-   Upload logo.
-   Choose brand colors.
-   Set public display name.
-   Configure terminology.
-   Choose a starter template.

### Step 4 --- Configure access

-   Designate initial owner.
-   Select the authority server for staff role verification.
-   Map administrator and staff role IDs.
-   Configure module-level permissions.
-   Verify the current user has the required authority.

### Step 5 --- Select modules

Suggested presets: - Virtual Airline Starter. - Rewards-focused
Community. - Full Airline Operations. - General Discord Community. -
Blank Workspace.

Presets are editable starting points, not locked product types.

### Step 6 --- Publish

-   Review configuration.
-   Validate channels, roles and bot permissions.
-   Publish selected Discord panels.
-   Run a test message.
-   Finish onboarding.

## 3.4 Organization switcher

The dashboard must include an organization switcher for users who belong
to multiple workspaces. Every page, API call and background job must
remain scoped to the selected organization.

## 3.5 Dashboard access

The website is staff-only. Members do not need accounts on the
management dashboard.

A user can see an organization only if: 1. They have authenticated
successfully. 2. They are a member of that organization through an
approved access path. 3. Their current Discord role/permission mapping
grants the requested access. 4. The organization is active and the
requested module is available.

Do not trust client-supplied organization IDs or role claims without
server-side verification.

------------------------------------------------------------------------

# 4. HOSTED SAAS AND SELF-HOSTED MODES

## 4.1 Hosted mode --- default

AeroNexus operates the bot, dashboard, API, database and background
workers.

The customer: - Signs up. - Connects Discord. - Configures the
organization. - Uses the service.

The customer does not need to host a bot process.

The cloud service must provide: - Shared bot service or controlled bot
worker fleet. - Tenant-scoped application services. - Background jobs. -
Persistent configuration. - Monitoring. - Backups. - Upgrade
management. - Service status and incident communication.

## 4.2 Shared bot model

The preferred hosted model is one official AeroNexus Discord bot
application serving multiple guilds.

Advantages: - Easier onboarding. - Centralized updates. - No customer
bot token management. - Consistent interaction behavior.

Limitations: - Bot username/avatar are global. - Shared application rate
limits and operational dependencies must be managed. - Customers depend
on the hosted bot's availability.

## 4.3 Dedicated bot application option

A later advanced option may allow an organization to connect its own
Discord application/bot.

Requirements: - Clear guided setup. - Secure credential storage. - Token
rotation. - Per-installation bot health. - Separate rate-limit and
failure reporting. - Explicit support boundaries.

Never expose a customer bot token to browser JavaScript or logs.

## 4.4 Self-hosted mode

The open-source release should support: - Self-hosted API and workers. -
Self-hosted dashboard. - Customer-owned Discord application. -
Customer-owned database and secrets. - Configuration import/export. -
Documented upgrade and backup procedures.

The self-hosted deployment must not require the hosted SaaS control
plane to operate core features.

## 4.5 Portability

A customer must be able to export: - Message templates. - Forms and
questions. - Module settings. - Rewards configuration. - Tier
definitions. - Automation definitions. - Role/channel mappings (with IDs
clearly marked for remapping). - Branding assets where permitted.

Exports must exclude: - Bot tokens. - OAuth secrets. - API keys. -
Session secrets. - Private user submissions unless explicitly selected
and authorized.

------------------------------------------------------------------------

# 5. DASHBOARD INFORMATION ARCHITECTURE

## 5.1 Main navigation

Navigation is permission-aware and module-aware.

1.  Overview
2.  Organization
3.  Members
4.  Flight Operations
5.  Rewards & Loyalty
6.  Marketplace
7.  Support Center
8.  Careers & Applications
9.  Advertisements
10. Partnerships & Alliances
11. Automation
12. Analytics
13. Message Studio
14. Form & Question Studio
15. Integrations
16. Module Marketplace
17. Permissions
18. Audit Logs
19. Developer Tools
20. Settings

## 5.2 Overview page

Display actual organization data: - Member counts. - Active/upcoming
flights. - Open tickets. - Pending applications. - Pending
redemptions. - Pending advertisement approvals. - Recent staff
activity. - Failed jobs. - Integration status. - Enabled modules.

Include quick actions: - Create flight. - Review applications. - Open
support inbox. - Create message template. - Create form. - Configure
module.

Do not display fabricated statistics in production.

## 5.3 Page-level UX requirements

Every management page must define: - Purpose. - Required permissions. -
Empty state. - Loading state. - Error state. - Search/filter behavior. -
Pagination for large lists. - Create/edit workflow. - Destructive action
confirmation. - Audit behavior. - Mobile behavior.

## 5.4 Staff-only boundary

Public member interactions happen in Discord by default. The dashboard
is for owners, administrators and authorized staff. A future public
member portal must be a separate explicitly enabled product surface with
separate permissions and privacy design.

------------------------------------------------------------------------

# 6. UNIVERSAL CONFIGURATION ENGINE

## 6.1 Configuration-first rule

Any setting that a community administrator reasonably needs to change
must be configurable without editing source code.

Examples: - Role IDs. - Channel IDs. - Message templates. - Question
sets. - Reward terminology. - Reward rates. - Tiers. - Achievements. -
Reward items. - Ticket categories. - Departments. - Application
questions. - Ad packages. - Timeouts. - Notifications. - Branding. -
Enabled modules. - Workflow rules.

Core invariants such as security checks, data isolation and transaction
integrity are not configurable away.

## 6.2 Configuration object requirements

Each configuration object should include: - Stable identifier. - Schema
version. - Organization/installation scope. - Display name. - Enabled
state where applicable. - Created/updated timestamps. - Actor metadata
for audited changes. - Validation result. - Version history where
important.

## 6.3 Editing workflow

Support: - Draft. - Validate. - Preview. - Publish. - Rollback.

Saving a draft must not silently publish a live Discord message or alter
a live workflow. Publishing must be a distinct action for consequential
configurations.

## 6.4 Configuration import/export

-   JSON import/export.
-   Schema validation.
-   Human-readable error messages.
-   Preview of changes before import.
-   Diff view.
-   Conflict handling.
-   ID remapping.
-   Version migration.
-   Rollback after failed publication.

------------------------------------------------------------------------

# 7. UNIVERSAL MESSAGE STUDIO

## 7.1 Purpose

A visual and JSON-based message editor for every configurable bot
message.

## 7.2 Supported modes

### Visual editor

Edit: - Content. - Embeds. - Title. - Description. - Color. - Author. -
Footer. - Fields. - Thumbnail. - Image. - Components. - Buttons. -
Select menus. - Supported message flags.

### Raw JSON editor

-   Syntax highlighting.
-   Formatting.
-   Validation.
-   Schema hints.
-   Error line/column reporting.
-   Search and replace.
-   Copy and export.

### Live preview

-   Visual preview updates from the same underlying document.
-   Preview should approximate Discord rendering.
-   Clearly indicate preview limitations.
-   Provide test-send to a configured test channel after permission
    confirmation.

## 7.3 Discohook compatibility

Support import of supported JSON exports from Discohook.

The import adapter must: 1. Parse the source format. 2. Identify
supported message/embed/component data. 3. Normalize it to AeroNexus's
internal message model. 4. Report unsupported or lossy fields. 5.
Validate the normalized document. 6. Preview the result. 7. Allow
editing. 8. Export a documented normalized format.

Do not claim every Discohook export can be sent directly to Discord
without transformation. Discord API payloads and editor export formats
may differ.

## 7.4 Variables

Support typed placeholders such as: - `{{user.name}}` - `{{user.id}}` -
`{{server.name}}` - `{{server.id}}` - `{{flight.number}}` -
`{{flight.origin}}` - `{{flight.destination}}` -
`{{flight.departure_time}}` - `{{rewards.balance}}` -
`{{rewards.tier}}` - `{{ticket.reference}}` -
`{{application.department}}`

Each message event must publish an allowed-variable schema. Unknown or
context-incompatible variables must fail validation.

Never evaluate arbitrary JavaScript, template code or shell commands.

## 7.5 Message events

Initial event catalog: - member.joined - ticket.opened -
ticket.claimed - ticket.closed - application.started -
application.submitted - application.accepted - application.rejected -
flight.created - flight.delayed - flight.cancelled - flight.checkin -
flight.completed - booking.confirmed - rewards.claimed -
rewards.adjusted - reward.redeemed - tier.changed -
achievement.unlocked - advertisement.submitted -
advertisement.approved - advertisement.published - partnership.submitted

Modules may register additional namespaced events.

## 7.6 Example message template

``` json
{
  "schema_version": "1.0",
  "template_id": "flight.announcement",
  "name": "Flight Announcement",
  "event": "flight.created",
  "payload": {
    "content": null,
    "embeds": [
      {
        "title": "{{flight.number}} | Flight Announcement",
        "description": "Join us for our upcoming flight.",
        "color": 15277667,
        "fields": [
          {
            "name": "Departure",
            "value": "{{flight.origin}}",
            "inline": true
          },
          {
            "name": "Destination",
            "value": "{{flight.destination}}",
            "inline": true
          },
          {
            "name": "Departure time",
            "value": "{{flight.departure_time}}",
            "inline": false
          }
        ],
        "footer": {
          "text": "{{server.name}}"
        }
      }
    ]
  }
}
```

This is an internal template example. The renderer resolves variables
and validates the final Discord payload.

## 7.7 Limits and safety

-   Enforce current Discord API limits.
-   Validate component types and supported component versions.
-   Sanitize untrusted variable values.
-   Prevent mention abuse.
-   Require explicit configuration for allowed role/user mentions.
-   Never allow imported JSON to grant permissions or trigger arbitrary
    actions.
-   Keep message payload editing separate from event/action
    authorization.

------------------------------------------------------------------------

# 8. UNIVERSAL FORM AND QUESTION STUDIO

## 8.1 Purpose

Every question-based workflow must use the same reusable form engine.

Use it for: - Careers. - Support intake. - Reports. - Partnerships. -
Advertisements. - Staff applications. - Onboarding. - Custom
organization workflows.

## 8.2 Question types

MVP: - Short text. - Long text. - Number. - Yes/no. - Single choice. -
Multiple choice. - Dropdown. - Date. - Time. - URL. -
Agreement/consent. - Discord user. - Discord role. - Attachment.

Extensions may add question types.

## 8.3 Question configuration

Each question should support: - Stable ID. - Type. - Label. -
Description/help text. - Required state. - Placeholder. - Default value
where appropriate. - Validation rules. - Display order. - Conditional
visibility. - Privacy classification. - Answer export behavior.

## 8.4 Advanced logic

Support: - Conditional questions. - Conditional sections. - Required-if
conditions. - Branching paths. - Answer validation. - Character
limits. - Numeric ranges. - Safe regex validation. - Question
dependencies. - Department-specific forms. - Reapplication rules. -
Timeouts. - Reminders. - Submission limits.

Conditions must use a constrained declarative rule format, not arbitrary
executable code.

## 8.5 Delivery modes

-   Discord modals for short forms within Discord limits.
-   Multi-step Discord interactions.
-   DM questionnaires.
-   Dashboard-hosted forms only when explicitly enabled.
-   Reusable workflows.

Do not attempt to put unlimited questions into one Discord modal.
Respect Discord's component and modal limits.

## 8.6 Example form

``` json
{
  "schema_version": "1.0",
  "form_id": "careers.flight_deck",
  "name": "Flight Deck Application",
  "version": 1,
  "settings": {
    "response_timeout_seconds": 600,
    "allow_reapplication": false,
    "enabled": true
  },
  "questions": [
    {
      "id": "experience",
      "type": "long_text",
      "label": "Describe your flight experience.",
      "required": true,
      "validation": {
        "min_length": 50,
        "max_length": 1500
      }
    },
    {
      "id": "availability",
      "type": "single_choice",
      "label": "How frequently can you attend flights?",
      "required": true,
      "options": [
        "Daily",
        "Several times a week",
        "Weekly",
        "Occasionally"
      ]
    }
  ]
}
```

## 8.7 Submission privacy

-   Application answers are private by default.
-   Reviewers must have explicit permission.
-   Internal reviewer notes are never sent to applicants.
-   Public result messages contain only approved minimal status
    information.
-   Retention and deletion policies are configurable within legal and
    operational constraints.

------------------------------------------------------------------------

# 9. MODULE SYSTEM AND MARKETPLACE

## 9.1 Core platform services

Core services cannot be disabled: - Authentication. - Tenant
isolation. - Permission enforcement. - Configuration validation. - Audit
logging. - Background job safety. - Secret handling. - Module registry.

## 9.2 Initial feature modules

-   Flight Operations.
-   Rewards & Loyalty.
-   Achievements.
-   Leaderboards.
-   Rewards Marketplace.
-   Support Tickets.
-   Careers & Recruitment.
-   Advertisements.
-   Partnerships & Alliances.
-   Analytics.
-   Automation.
-   Member Management.
-   Booking Integration.

## 9.3 Module lifecycle

A module must support: - Install. - Validate. - Enable. - Disable. -
Upgrade. - Configure. - Health check. - Uninstall where safe.

Disabling a module must not delete its historical data. Uninstalling
must require explicit confirmation and a documented data-retention
choice.

## 9.4 Module manifest

Example:

``` json
{
  "manifest_version": "1.0",
  "id": "com.aeronexus.rewards",
  "name": "Rewards and Loyalty",
  "version": "1.0.0",
  "description": "Points, tiers, achievements and member rewards.",
  "publisher": "AeroNexus",
  "dependencies": [
    {
      "id": "com.aeronexus.core",
      "version": "^1.0.0"
    }
  ],
  "capabilities": [
    "rewards.view",
    "rewards.adjust",
    "rewards.configure",
    "rewards.redeem"
  ],
  "configuration_schema": "./schemas/config.schema.json",
  "events": [
    "flight.completed",
    "rewards.claimed"
  ],
  "permissions": [
    "rewards.view",
    "rewards.manage"
  ]
}
```

## 9.5 Module dependency rules

Examples: - Achievements may depend on Rewards. - Marketplace may depend
on Rewards. - Booking Integration may depend on Flight Operations. -
Advertisement purchases may depend on Support Tickets.

The platform must detect dependency conflicts before activation or
deactivation.

## 9.6 Third-party module ecosystem

The long-term platform should support a module catalog.

Requirements: - Publisher identity. - Version. - Compatibility range. -
Dependency declarations. - Permission/capability declarations. -
Documentation. - Changelog. - Security review status. - Signature or
trusted-publisher verification where supported. - Install/update/disable
controls.

Third-party modules must not receive unrestricted access to the host
environment. Use a constrained extension API, permission grants and
isolation boundaries. Do not execute arbitrary marketplace packages in
the main application process without a reviewed security model.

------------------------------------------------------------------------

# 10. PREMIUM / ENTITLEMENT SYSTEM

## 10.1 Design

Support configurable feature entitlements inspired by Milo Premium,
while keeping the open-source core useful.

Possible profiles: - Community. - Premium. - Enterprise. - Custom.

These are example labels, not fixed commercial plans.

## 10.2 Feature flags

Examples: - Advanced automation. - Advanced analytics. - Custom
branding. - Additional integrations. - Advanced form logic. - Extended
audit retention. - Advanced partnership features. - Dedicated bot
deployment.

## 10.3 Requirements

-   Centralized entitlement service.
-   Feature checks at the service/API layer.
-   Clear unavailable-feature explanations.
-   Entitlement versioning.
-   Self-hosted override policy documented by deployment owners.
-   Graceful behavior if a remote entitlement service is unavailable.
-   No hardcoded premium checks scattered throughout modules.

Security, data ownership, basic exports and essential reliability must
not be paywalled.

------------------------------------------------------------------------

# 11. REWARDS AND LOYALTY

## 11.1 Configurable terminology

Organizations can rename: - Programme. - Points. - Tiers. -
Achievements. - Rewards. - Member labels.

Do not hardcode "miles" or "Flying Blue".

## 11.2 Member features

-   Rewards profile.
-   Current balance.
-   Current tier.
-   Progress to next tier.
-   Transaction history.
-   Achievements.
-   Leaderboards.
-   Marketplace.
-   Redemption requests.
-   Flight claims.
-   Daily rewards.
-   Streaks.
-   Seasonal progression.
-   Member statistics.

## 11.3 Earning rules

Support: - Flat rewards. - Distance-based rewards. - Route-specific
rates. - Cabin multipliers. - Event multipliers. - Crew rewards. -
Manual adjustments. - Milestone bonuses. - Verified booking/completion
rewards.

All rules must be configurable and versioned.

## 11.4 Tiers

Support: - Configurable tier count. - Names. - Thresholds. - Role
mappings. - Benefits. - Progress calculations. - Automatic role
assignment/removal. - Optional demotion rules. - Manual review where
configured.

## 11.5 Achievements

Support: - Automatic achievements. - Manual achievements. - Hidden
achievements. - Progress-based achievements. - Repeatable achievements
where allowed. - Achievement rewards. - Reset permissions.

## 11.6 Marketplace

Support: - Custom items. - Categories. - Price. - Inventory. -
Redemption limits. - Approval requirements. - Fulfilment. - Refunds. -
Expiration. - History.

## 11.7 Transaction integrity

Every adjustment must create an immutable ledger entry.

A balance is derived from or reconciled against ledger transactions; it
must not be silently edited.

Every award/redemption operation must have an idempotency key or
equivalent duplicate-prevention mechanism.

Staff adjustments require a reason and actor identity.

------------------------------------------------------------------------

# 12. FLIGHT OPERATIONS

## 12.1 Lifecycle

-   Draft.
-   Scheduled.
-   Announced.
-   Check-in.
-   Boarding/active (optional).
-   Delayed.
-   Completed.
-   Cancelled.

Organizations may customize displayed labels, but internal lifecycle
states must remain stable.

## 12.2 Flight management

-   Create/edit flights.
-   Configure flight reference.
-   Origin/destination.
-   Aircraft.
-   Departure and arrival time.
-   Timezone display.
-   Capacity.
-   Cabin classes.
-   Host.
-   Crew positions.
-   Booking link.
-   Discord scheduled event.
-   Public announcement.
-   Private staff briefing.
-   Participant list.
-   Check-in.
-   Delay/cancellation.
-   Completion summary.
-   History.

## 12.3 Advanced features

-   Duplicate active-flight detection.
-   Schedule conflict detection.
-   Crew availability.
-   Capacity management.
-   Automated reminders.
-   Check-in countdown.
-   Host controls.
-   Flight analytics.
-   Verified reward issuance.
-   Route statistics.

## 12.4 Booking integration

Provide versioned, authenticated integration contracts for: - Listing
bookable flights. - Retrieving flight details. - Reporting booking
confirmation. - Reporting booking cancellation. - Retrieving check-in
information. - Receiving booking status updates.

Use signed webhooks or authenticated API requests, idempotency, retries
and event logs.

The booking website remains a separate application.

------------------------------------------------------------------------

# 13. SUPPORT CENTER

## 13.1 Ticket categories

Categories must be created by administrators. Initial templates may
include: - General Support. - Partnership Enquiry. - Member/Issue
Report. - Fast Pass/Direct Entry. - Other Enquiry.

## 13.2 Lifecycle

1.  Member opens a support entry point.
2.  Member selects a category.
3.  Optional custom intake form is completed.
4.  Private ticket is created.
5.  Configured staff notification is sent.
6.  Authorized staff claim or assign the ticket.
7.  Staff and member communicate.
8.  Authorized participant requests closure.
9.  Closure confirmation is collected.
10. Transcript and closure summary are generated.
11. Staff log receives the record.
12. Member is notified.
13. Ticket channel is archived or deleted according to configuration.

## 13.3 Staff inbox

Dashboard features: - Search. - Filters. - Status. - Category. -
Assignment. - Claim/unclaim. - Transfer. - Internal notes. - Participant
list. - Transcript. - Closure reason. - Response-time metrics. - Audit
history.

Ticket access must never be widened accidentally during claim, unclaim
or transfer.

------------------------------------------------------------------------

# 14. CAREERS AND RECRUITMENT

## 14.1 Configuration

Administrators can create unlimited configurable departments, subject to
practical limits.

Each department can have: - Name. - Description. - Application status. -
Form. - Role mapping. - Reviewer permissions. - Timeout. - Reminder
policy. - Reapplication policy. - Decision message templates.

## 14.2 Applicant experience

-   Select department.
-   Receive agreement.
-   Accept agreement.
-   Answer questions one at a time or through supported form steps.
-   Receive timeout/reminder behavior according to configuration.
-   Submit application.
-   Receive confirmation.

## 14.3 Staff review

-   View applicant and answers.
-   Assign reviewer.
-   Add private notes.
-   Accept/deny/request more information.
-   Require reason for denial where configured.
-   Assign mapped role after acceptance.
-   Notify applicant privately.
-   Record decision history.

No automated AI-content detection is required by default. Any future AI
assistance must be optional, transparent and advisory rather than an
unreviewable hiring decision.

------------------------------------------------------------------------

# 15. ADVERTISEMENTS AND PROMOTIONS

## 15.1 Configurable packages

Package names, prices, currency labels, duration, priority, pings,
designs and benefits are all editable.

Initial example packages may be: - Basic. - Featured. - Premium. -
Spotlight.

Do not hardcode Robux prices or assume every installation uses the same
package model.

## 15.2 Workflow

1.  Member selects package.
2.  System creates a support request/ticket with package details.
3.  Buyer and staff confirm content and payment.
4.  Staff manually approve payment.
5.  Staff approve content.
6.  System publishes the configured message.
7.  Expiration is scheduled.
8.  Publication status and history are recorded.

Do not publish before all configured approvals are complete.

Automatic Robux payment verification is outside the initial scope unless
a future integration is explicitly specified and reviewed.

------------------------------------------------------------------------

# 16. PARTNERSHIPS AND ALLIANCES

Support: - Partnership applications. - Partner directory. - Approval
workflow. - Partner status. - Benefit configuration. - Discounts. -
Contact details. - Partnership history. - Alliance membership. -
Optional shared rewards rules.

Cross-organization rewards sharing must be opt-in, explicitly authorized
by both parties and auditable.

------------------------------------------------------------------------

# 17. AUTOMATION ENGINE

## 17.1 Workflow model

An automation consists of: - Trigger. - Conditions. - Actions. -
Execution policy. - Retry policy. - Error behavior. - Enabled state. -
Version.

## 17.2 Triggers

Examples: - Flight created/delayed/cancelled/completed. - Booking
confirmed/cancelled. - Ticket opened/closed. - Application
submitted/accepted/rejected. - Tier changed. - Reward redeemed. -
Advertisement approved/published. - Scheduled time. - Configured webhook
received.

## 17.3 Actions

Examples: - Send message. - Assign/remove role. - Award points. - Create
ticket. - Notify staff. - Publish approved promotion. - Update
integration. - Generate report. - Schedule another supported action.

## 17.4 Safety

-   Persist jobs.
-   Retry transient failures.
-   Use idempotency.
-   Detect loops.
-   Limit execution depth and frequency.
-   Record every execution.
-   Support manual retry.
-   Survive process restarts.
-   Never run arbitrary user-supplied code in the standard workflow
    engine.

------------------------------------------------------------------------

# 18. PERMISSIONS AND AUTHORIZATION

## 18.1 Dashboard roles

Support configurable roles such as: - Owner. - Administrator. -
Management. - Department Manager. - Staff. - Reviewer. - Read-only
Auditor.

These are presets; actual permissions are granular.

## 18.2 Discord role mapping

The organization configures: - Authority guild/server ID. - Owner/admin
role IDs. - Staff role IDs. - Department role IDs. - Module-specific
role mappings.

The platform must verify roles against the configured authority server,
even if an interaction began in a different server.

## 18.3 Permission examples

-   `organization.view`
-   `organization.configure`
-   `members.view`
-   `members.manage`
-   `flights.view`
-   `flights.create`
-   `flights.edit`
-   `flights.cancel`
-   `rewards.view`
-   `rewards.adjust`
-   `rewards.configure`
-   `tickets.view`
-   `tickets.claim`
-   `tickets.close`
-   `careers.review`
-   `advertisements.approve`
-   `modules.manage`
-   `integrations.manage`
-   `audit.view`
-   `permissions.manage`

## 18.4 Authorization rules

-   Enforce permissions server-side.
-   Deny by default.
-   Re-check access for sensitive actions.
-   Avoid trusting cached role information indefinitely.
-   Record sensitive decisions.
-   Prevent removing the final owner/admin without a recovery path.
-   Never expose private content in permission-denied responses.

------------------------------------------------------------------------

# 19. DEVELOPER MODE AND EXTENSION ECOSYSTEM

Developer Mode is a first-class dashboard area.

## 19.1 Developer tools

-   API explorer.
-   OpenAPI viewer.
-   Webhook tester.
-   Event inspector.
-   Configuration schema viewer.
-   JSON validator.
-   Configuration diff.
-   Module diagnostics.
-   Integration health.
-   Background job inspector.
-   Test-message sender.
-   Import/export tools.
-   Error and trace references.

Sensitive values must be redacted.

## 19.2 API documentation

Use: - OpenAPI for HTTP APIs. - JSON Schema for configuration
documents. - Versioned event schemas for event contracts. - Markdown
guides for workflows. - Examples for every public extension point.

## 19.3 Module SDK

Provide a documented SDK or extension interface that exposes only
supported capabilities.

A module must declare: - Identity. - Version. - Compatibility. -
Dependencies. - Permissions. - Configuration schema. - Events
consumed. - Events emitted. - Dashboard contributions. - Discord
interaction contributions. - Data ownership and retention behavior.

## 19.4 Extension safety

-   No unrestricted host filesystem access.
-   No access to unrelated tenant data.
-   No implicit secret access.
-   Explicit permission grants.
-   Resource limits.
-   Version compatibility checks.
-   Review/signing policy for hosted marketplace distribution.
-   Clear uninstall and data-retention behavior.

------------------------------------------------------------------------

# 20. ANALYTICS AND REPORTING

Support organization-level analytics: - Member growth. - Flight
participation. - Popular routes. - Flight completion/cancellation. -
Crew participation. - Rewards issued/redeemed. - Tier distribution. -
Achievement unlocks. - Ticket volume and response times. - Application
acceptance and review times. - Advertisement campaign activity. -
Automation success/failure. - Module health.

Requirements: - Permission-aware reports. - Configurable date ranges. -
Timezone-aware presentation. - CSV export at minimum. - Clear
definitions for metrics. - No fabricated metrics. - Privacy-conscious
aggregation.

------------------------------------------------------------------------

# 21. INTEGRATIONS

## 21.1 Discord

Support: - OAuth2. - Bot installation. - Guild/channel/role
resolution. - Interactions. - Messages and embeds. - Scheduled events
where supported. - Role management where permitted. - Discord API
rate-limit handling.

## 21.2 External booking systems

Provide documented API and webhook contracts.

## 21.3 Roblox-related services

Treat Roblox integrations as optional adapters. Do not assume every
organization uses Roblox or that a particular API is available.

## 21.4 Webhooks

Support: - Signing secrets. - Timestamp validation. - Replay
protection. - Idempotency. - Retry policy. - Delivery history. - Secret
rotation.

## 21.5 Integration registry

Every integration must declare: - Name. - Version. - Required
permissions. - Required credentials. - Supported events. - Supported
actions. - Health checks. - Failure behavior.

------------------------------------------------------------------------

# 22. TECHNICAL ARCHITECTURE

## 22.1 Logical architecture

Separate: - Web dashboard. - API/application layer. - Discord
gateway/interaction adapter. - Shared domain services. - Configuration
engine. - Module registry. - Background workers. - Persistence layer. -
Integration adapters. - Observability services.

The dashboard and bot must call shared business services. Do not
duplicate reward calculations, permission rules or flight lifecycle
logic in separate clients.

## 22.2 Suggested repository structure

``` text
aeronexus/
├── apps/
│   ├── dashboard/
│   ├── api/
│   ├── discord-bot/
│   └── worker/
├── packages/
│   ├── domain/
│   ├── shared-types/
│   ├── permissions/
│   ├── tenancy/
│   ├── configuration/
│   ├── message-engine/
│   ├── form-engine/
│   ├── automation-engine/
│   ├── module-registry/
│   ├── event-contracts/
│   ├── integrations-sdk/
│   └── observability/
├── modules/
│   ├── flight-operations/
│   ├── rewards/
│   ├── achievements/
│   ├── marketplace/
│   ├── support/
│   ├── careers/
│   ├── advertisements/
│   ├── partnerships/
│   └── analytics/
├── schemas/
│   ├── messages/
│   ├── forms/
│   ├── modules/
│   ├── automations/
│   ├── installations/
│   └── events/
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── api/
│   ├── modules/
│   ├── configuration/
│   ├── security/
│   ├── operations/
│   └── decisions/
├── examples/
├── scripts/
├── tests/
├── AGENTS.md
├── README.md
├── CONTRIBUTING.md
└── LICENSE
```

This is a proposed logical layout. Adapt it to the existing repository
and chosen stack. Do not create duplicate packages simply to match this
tree.

## 22.3 Technology selection

Do not select a framework or database solely because it is fashionable.

Before implementation, document: - Existing repository stack. - Team
familiarity. - Discord library compatibility. - Hosting constraints. -
Database transaction requirements. - Background job requirements. -
Multi-tenant isolation strategy. - Deployment and maintenance cost. -
Open-source dependency licenses.

The final architecture decision must be recorded in Architecture
Decision Records (ADRs).

## 22.4 Data requirements

The persistence layer must support: - Tenant isolation. -
Transactions. - Unique constraints. - Immutable audit/ledger records. -
Configuration versioning. - Migrations. - Backups. - Recovery. - Query
pagination. - Data retention policies.

Use stable internal IDs. Discord names are display data, not primary
identifiers.

## 22.5 Multi-tenant enforcement

Every tenant-owned record and operation must be scoped to an
organization/installation.

Use database-level protections where practical in addition to
application checks.

Test for: - Cross-tenant reads. - Cross-tenant writes. - Background jobs
missing tenant context. - Cache-key collisions. - Search-index
leakage. - Export leakage. - Webhook tenant confusion.

## 22.6 API conventions

-   Version APIs.
-   Use consistent request/response envelopes.
-   Validate inputs.
-   Return stable error codes.
-   Support pagination.
-   Apply rate limits.
-   Enforce authorization.
-   Document deprecations.
-   Use idempotency for retriable mutations.

## 22.7 Event-driven operations

Events should be versioned and include: - Event ID. - Event type. -
Schema version. - Organization ID. - Installation ID where relevant. -
Occurrence timestamp. - Actor where applicable. - Correlation ID. -
Idempotency/deduplication reference where applicable. - Typed payload.

Do not rely on an unstructured string event bus.

------------------------------------------------------------------------

# 23. CONFIGURATION VERSIONING AND SCHEMAS

Every major configuration type must have a JSON Schema.

Initial schema families: - Organization. - Installation. - Role
mappings. - Channel mappings. - Message template. - Form. - Question. -
Module manifest. - Module configuration. - Automation. - Rewards
programme. - Tier. - Achievement. - Marketplace item. - Flight
template. - Advertisement package. - Integration.

Requirements: - Explicit schema version. - Validation before publish. -
Migration path. - Compatibility policy. - Configuration diff. -
Rollback. - Invalid configuration recovery.

Example:

``` json
{
  "schema_version": "1.0",
  "organization_id": "org_example",
  "updated_at": "2026-11-06T09:00:00Z",
  "configuration": {}
}
```

Never silently discard unknown configuration fields during migration.
Preserve or report them according to the migration policy.

------------------------------------------------------------------------

# 24. SECURITY, PRIVACY AND COMPLIANCE

## 24.1 Security controls

-   Discord OAuth2.
-   Secure session cookies.
-   CSRF protection.
-   Server-side authorization.
-   Tenant isolation.
-   Secret encryption/storage.
-   Token redaction.
-   API rate limiting.
-   Input validation.
-   Output encoding.
-   Webhook signatures.
-   Replay protection.
-   File upload validation.
-   Audit records.
-   Backup encryption.
-   Dependency vulnerability management.

## 24.2 Secret handling

Never place: - Bot tokens. - OAuth client secrets. - API keys. - Webhook
signing secrets. - Database credentials. - Session secrets

in browser code, public configuration exports, logs or source control.

## 24.3 Privacy controls

Provide organization-level settings for: - Data retention. - Application
retention. - Ticket transcript retention. - Member data export. - Member
data deletion requests. - Rewards history retention. - Audit retention.

Deletion must respect legitimate audit, fraud-prevention and legal
retention requirements. Document which data can be deleted, anonymized
or retained.

## 24.4 Sensitive information

Do not collect unnecessary personal information. Do not request
passwords or sensitive identity documents for ordinary community
workflows.

------------------------------------------------------------------------

# 25. RELIABILITY AND OPERATIONS

## 25.1 Background jobs

-   Persist scheduled work.
-   Recover after restarts.
-   Retry transient errors.
-   Use bounded retry policies.
-   Dead-letter permanently failing jobs.
-   Provide operator visibility.
-   Prevent duplicate side effects.

## 25.2 Discord/API failures

If Discord or an external dependency fails: - Do not claim success. -
Record the failure. - Preserve enough state for safe recovery. - Inform
the user/staff appropriately. - Retry only when safe. - Avoid duplicate
messages or awards.

## 25.3 Observability

Provide: - Structured logs. - Metrics. - Traces/correlation IDs. - Job
execution history. - Integration health. - Error tracking. - Service
health. - Tenant-safe diagnostics.

Never expose another organization's data in diagnostics.

## 25.4 Backups and disaster recovery

Document: - Backup frequency. - Retention. - Encryption. - Restore
testing. - Recovery objectives. - Configuration recovery. - Secret
recovery/rotation. - Incident communication.

------------------------------------------------------------------------

# 26. OPEN-SOURCE GOVERNANCE

## 26.1 Repository requirements

Public repository should include: - README. - License. - Contribution
guide. - Code of conduct. - Security policy. - Issue templates. - Pull
request template. - Changelog. - Release policy. - Documentation. -
Example configuration. - Self-hosting guide.

## 26.2 License

Select the license after reviewing: - Desired commercial use. -
Redistribution. - Hosted-service use. - Contributions. - Third-party
dependencies. - Trademark policy.

Do not imply that an open-source license grants rights to Discord,
Roblox, airline or third-party branding assets.

## 26.3 Governance

Define: - Maintainers. - Review requirements. - Release authority. -
Security disclosure process. - Deprecation policy. - Module
compatibility policy. - Contribution standards.

## 26.4 Branding and trademark

AeroNexus is a proposed product brand. Keep the platform brand separate
from customer airline brands. Do not bundle third-party airline logos or
imply endorsement.

------------------------------------------------------------------------

# 27. DOCUMENTATION FOR HUMAN DEVELOPERS AND AI AGENTS

## 27.1 Human documentation

Provide: - Product overview. - Installation. - Cloud onboarding. -
Self-hosting. - Configuration. - Module development. - API usage. -
Deployment. - Security. - Troubleshooting. - Contribution guide. -
Operations handbook.

## 27.2 Machine-readable documentation

Provide: - OpenAPI specification. - JSON Schemas. - Event schemas. -
Module manifests. - Example configuration files. - Versioned API
contracts.

## 27.3 Repository instruction files

Required root files: - `AGENTS.md` - `ARCHITECTURE.md` -
`TECHNICAL_SPEC.md` - `MODULE_SPEC.md` - `CONFIGURATION_SPEC.md` -
`SECURITY_SPEC.md` - `TESTING_SPEC.md` - `CONTRIBUTING.md`

Module-specific instruction files should explain local architecture,
dependencies, public interfaces, tests and prohibited shortcuts.

## 27.4 AI coding agent rules

Agents must: 1. Read root instructions before editing. 2. Inspect
existing code before proposing replacements. 3. Follow documented module
boundaries. 4. Use declared schemas and API contracts. 5. Avoid
inventing configuration fields. 6. Preserve tenant isolation. 7. Add or
update tests. 8. Update documentation when behavior changes. 9. Never
commit secrets. 10. Report assumptions and unresolved decisions. 11.
Avoid claiming a feature is complete without tests or evidence. 12.
Prefer small, reviewable changes.

------------------------------------------------------------------------

# 28. TESTING STRATEGY

## 28.1 Test layers

-   Unit tests.
-   Domain/service tests.
-   API contract tests.
-   Schema validation tests.
-   Integration tests.
-   Discord adapter tests.
-   Multi-tenant isolation tests.
-   Permission tests.
-   End-to-end tests.
-   Load and rate-limit tests.
-   Recovery tests.
-   Security tests.

## 28.2 Critical acceptance tests

### Cloud onboarding

-   User signs in with Discord.
-   User creates organization.
-   User connects authorized guild.
-   Bot installation is verified.
-   Role mappings are configured.
-   User enables modules.
-   Test message publishes.
-   Dashboard opens with correct permissions.

### Tenant isolation

-   Organization A cannot read organization B.
-   Organization A cannot mutate organization B.
-   Background jobs preserve tenant scope.
-   Exports contain only selected tenant data.

### Message Studio

-   Import supported Discohook export.
-   Show unsupported fields.
-   Edit visual representation.
-   Edit raw JSON.
-   Preview.
-   Validate.
-   Test-send.
-   Export.
-   Restore previous version.

### Form Studio

-   Create a form without code.
-   Add all supported question types.
-   Configure conditions.
-   Publish.
-   Submit.
-   Review privately.
-   Apply timeout.
-   Export authorized data.

### Module system

-   Enable module.
-   Disable module.
-   Reject missing dependencies.
-   Preserve history.
-   Upgrade compatible version.
-   Reject incompatible version safely.

### Rewards

-   Award points.
-   Deduct points with reason.
-   Claim once.
-   Reject duplicate claim.
-   Redeem item.
-   Prevent overselling inventory.
-   Update tier role.
-   Preserve ledger.

### Flights

-   Create flight.
-   Publish announcement.
-   Create/update scheduled event.
-   Delay.
-   Cancel.
-   Complete.
-   Recover scheduled actions after restart.
-   Prevent duplicate flight references.

### Permissions

-   Unauthorized user denied.
-   Authorized role accepted.
-   Role revoked and access rechecked.
-   Cross-server authority correctly verified.
-   Final owner recovery protected.

------------------------------------------------------------------------

# 29. DELIVERY ROADMAP

## Phase 0 --- Discovery and architecture

-   Inspect repository and existing specifications.
-   Decide hosted/self-hosted boundaries.
-   Create ADRs.
-   Confirm Discord application model.
-   Define tenant model.
-   Define initial deployment and cost model.
-   Finalize licensing direction.

## Phase 1 --- Cloud foundation

-   Account signup.
-   Organization creation.
-   Discord connection.
-   Installation model.
-   Dashboard shell.
-   Tenant isolation.
-   Permissions.
-   Configuration service.
-   Audit log.
-   Observability.

## Phase 2 --- Configuration studios

-   Message Studio.
-   Discohook import adapter.
-   JSON editor.
-   Live preview.
-   Form and Question Studio.
-   JSON Schemas.
-   Configuration versioning.
-   Import/export.

## Phase 3 --- Core community operations

-   Support.
-   Careers.
-   Flight operations.
-   Staff workflows.
-   Notifications.
-   Background job reliability.

## Phase 4 --- Rewards and loyalty

-   Profiles.
-   Points ledger.
-   Tiers.
-   Achievements.
-   Leaderboards.
-   Marketplace.
-   Daily rewards.
-   Events.
-   Advanced progression.

## Phase 5 --- Business and community modules

-   Advertisements.
-   Partnerships.
-   Alliances.
-   Booking integration.
-   Analytics.

## Phase 6 --- Developer ecosystem

-   Developer Mode.
-   Public API docs.
-   Module SDK.
-   Module catalog.
-   Webhook tooling.
-   Extension security model.

## Phase 7 --- Premium and scale

-   Entitlements.
-   Advanced automation.
-   Advanced analytics.
-   Optional dedicated bot applications.
-   Scaling and operational hardening.

## Phase 8 --- Release

-   Security review.
-   Recovery testing.
-   Documentation.
-   Self-hosted deployment.
-   Open-source governance.
-   Stable release.

Do not attempt to build every module before the tenant, permissions,
configuration and reliability foundations are tested.

------------------------------------------------------------------------

# 30. UNRESOLVED PRODUCT DECISIONS

These must be decided before the relevant implementation phase.

1.  Final product name and domain.
2.  Final open-source license.
3.  Hosted service ownership and operating budget.
4.  Whether the hosted service uses one shared bot or offers dedicated
    customer bots.
5.  Hosting provider and data residency requirements.
6.  Authentication/session architecture.
7.  Database and job queue technology.
8.  Initial language support.
9.  Initial feature entitlements.
10. Module marketplace trust and review policy.
11. Data retention defaults.
12. Customer export and deletion policy.
13. Whether public member web portals will ever be supported.
14. Whether custom domains/white-label branding are in scope.
15. Support and incident response expectations.

A decision must be recorded in an ADR or product decision log. Do not
silently invent answers.

------------------------------------------------------------------------

# 31. DEFINITION OF DONE

AeroNexus MVP is ready for real pilot organizations when:

-   A user can sign up with Discord.
-   A user can create an organization workspace.
-   A user can connect an authorized Discord guild.
-   The shared bot can serve multiple isolated organizations.
-   The owner can configure staff role IDs in the dashboard.
-   The dashboard is staff-only.
-   Core permissions are enforced server-side.
-   Modules can be enabled and disabled safely.
-   Message Studio supports visual editing, raw JSON, validation,
    preview and supported Discohook imports.
-   Form Studio supports custom questions and conditional logic.
-   Configuration can be exported and imported.
-   Support, careers and flight operations work end-to-end.
-   Rewards maintain an auditable transaction ledger.
-   Scheduled tasks survive restarts.
-   Duplicate actions do not duplicate rewards or publications.
-   Audit logs record consequential actions.
-   Documentation is usable by human developers and AI coding agents.
-   A self-hosting path is documented or explicitly scheduled for the
    first open-source release.

The broader platform is ready for a public stable release only after the
security, multi-tenant, recovery, documentation and operational
requirements have been validated.

------------------------------------------------------------------------

# APPENDIX A --- INITIAL KLM PTFS PROFILE

KLM PTFS is the first example organization, not a special code path.

Its initial profile can configure: - Organization name: KLM PTFS. -
Organization type: Virtual Airline. - Authority server: designated
private staff Discord. - Public server: community Discord. - Flight
Operations. - Rewards and Loyalty. - Support. - Careers. -
Advertisements. - Partnerships. - Booking integration.

The initial KLM implementation must preserve its existing functional
expectations: - Private support tickets and transcripts. - Private
career applications and staff review. - Flight announcements, briefings,
crew positions, check-in, delays, cancellations and completion. -
Community rewards and configurable tiers. - Paid promotion approval and
publishing. - Staff authority verified against the designated staff
server. - Audit records, duplicate prevention and restart-safe scheduled
actions.

KLM branding, roles, channels, prices, forms and messages must all be
organization configuration---not global platform constants.

# APPENDIX B --- INITIAL DISCORD COMMAND PHILOSOPHY

Keep the slash-command surface intentionally small.

Suggested member commands: - `/panel` --- open the member interface. -
`/profile` --- open the member profile. - `/claim` --- claim a verified
flight reward. - `/flight` --- access flight information. - `/help` ---
contextual help.

Suggested staff commands: - `/staff` --- open staff controls. -
`/flight` --- contextual flight management, subject to permissions. -
`/review` --- access pending reviews.

Suggested administrative command: - `/dashboard` --- provide the
dashboard link.

Use buttons, dropdowns, modals and dashboard workflows for the rest. Do
not recreate dozens of configuration commands.

# APPENDIX C --- PRODUCT EXPERIENCE IN ONE SENTENCE

A community owner signs up, creates their airline workspace, connects
Discord, configures their own brand, roles, messages, forms, rewards and
modules, then operates the entire community through a staff-only cloud
dashboard while members use a streamlined Discord experience.

**AeroNexus --- Your airline. One control center.**
