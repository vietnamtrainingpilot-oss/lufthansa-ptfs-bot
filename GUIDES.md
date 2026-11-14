# LUFTHANSA MILES & MORE
# COMPLETE IMPLEMENTATION SPECIFICATION
## Command-by-command functionality, system behaviour, interactive setup, business rules and acceptance criteria

---

# 1. YOUR ROLE AND PRIMARY OBJECTIVE

You are the senior full-stack engineer responsible for completing an existing Lufthansa Miles & More Discord loyalty bot.

You are not being asked to brainstorm, propose an architecture, produce a mockup or create a partial demonstration.

You are being asked to inspect the existing repository, understand its architecture, implement missing functionality, repair broken functionality and deliver a complete working product.

The existing application has already undergone a rebuild. Continue from the existing codebase.

**DO NOT START OVER. DO NOT DELETE WORKING SYSTEMS. DO NOT REPLACE EXISTING DATA.**

Your responsibilities:

1. Inspect the complete repository.
2. Understand existing commands, services, database structures and dashboard.
3. Compare the implementation against this specification.
4. Identify missing, incomplete and broken functionality.
5. Implement the missing functionality directly.
6. Test every command and workflow.
7. Fix failures.
8. Provide a verifiable implementation report.

Do not stop after producing an audit. The audit is the beginning of the implementation work.

Do not ask the founder to make routine technical decisions that can be resolved from this specification and existing repository.

If a configuration value is unknown, implement a configurable setting and leave it clearly unconfigured. Never invent a real Discord role ID, channel ID, API credential, reward catalogue or airline-specific business rule.

---

# 2. PRODUCT IDENTITY AND SCOPE

Product: Lufthansa Miles & More Discord Loyalty Bot.

Reference: Milo Discord bot.

Milo is a functional reference for:
- Command organisation.
- Member experiences.
- Administrative workflows.
- Mileage management.
- Flight claims.
- Reward redemption.
- Achievements.
- Alliances.
- Premium features.
- Branding.
- Interactive Discord interfaces.

This is not required to be a pixel-perfect Milo clone.

Adapt the system to a Lufthansa Miles & More-inspired loyalty programme.

## In scope

- Member accounts.
- Membership tiers.
- Award Miles.
- Status qualification.
- Flight registration.
- Flight claims.
- Route and distance management.
- Rewards shop.
- Redemptions.
- Achievements.
- Daily rewards.
- Events.
- Alliances.
- Staff administration.
- Custom branding.
- Premium functionality.
- Configuration wizard.
- Dashboard, if already included in the repository.

## Explicitly out of scope

Do not introduce:
- Career management.
- Recruitment.
- Ticketing systems unrelated to reward redemption.
- A separate airline booking platform.
- Real-world airline reservation integrations.
- A flight operations management platform.
- An unrelated website builder.

This is a Discord loyalty system.

---

# 3. IMPORTANT PRODUCT RULES

## 3.1 Separate loyalty currencies

Implement and maintain distinct balances:

**Award Miles**
- Spendable currency.
- Earned through eligible flights and configured promotions.
- Used for shop redemptions.
- Can be credited or debited by authorized staff.
- Must have a complete transaction history.

**Points**
- Used for membership qualification.
- Not spendable.
- Accumulated according to configured qualification rules.

**Qualifying Points**
- Separate qualification counter.
- Not spendable.
- Used where the configured tier requires them.

**HON Circle Points**
- Separate qualification counter.
- Not spendable.
- Used for HON Circle qualification.

Never treat Award Miles as interchangeable with qualification Points.

## 3.2 Lufthansa-inspired membership tiers

The default tier structure should support:

1. Member — registered account without an achieved elite status.
2. Frequent Traveller.
3. Senator.
4. HON Circle.

Use the real-world Miles & More qualification structure as a reference:

| Status | Points | Qualifying Points | HON Circle Points |
|---|---:|---:|---:|
| Frequent Traveller | 650 | 325 | Not required |
| Senator | 2,000 | 1,000 | Not required |
| HON Circle | Configurable programme logic | Configurable programme logic | 6,000 |

These are reference thresholds, not immutable values.

The administrator must be able to configure them.

Qualification rules must support multiple conditions, including AND requirements.

For example:

Frequent Traveller requires:
- At least 650 Points.
- At least 325 Qualifying Points.

Both must be satisfied.

Do not grant a status merely because one counter reaches its threshold.

## 3.3 Real-world benefits disclaimer

The bot may display descriptions of Lufthansa-inspired membership benefits.

It must clearly state that Discord membership status does not provide actual Lufthansa airline benefits, lounge access, upgrades, flights or real-world privileges.

---

# 4. COMPLETE COMMAND SPECIFICATION

For every command:
- Register the correct slash command.
- Implement the command handler.
- Validate parameters.
- Validate permissions.
- Perform the actual operation.
- Update persistent data.
- Send a clear Discord response.
- Record relevant audit events.
- Handle errors gracefully.

A registered but nonfunctional command is not complete.

---

# 5. MEMBER COMMANDS

## 5.1 `/sign-up`

Purpose: Register a Discord member for the loyalty programme.

Behaviour:

1. Check whether the Discord user already has an account.
2. If not, create a member account.
3. Generate a unique membership identifier.
4. Initialize Award Miles and qualification counters.
5. Assign the configured default membership role if available.
6. Save the registration timestamp.
7. Display a registration confirmation.

Suggested account information:
- Discord user ID.
- Membership ID.
- Display name.
- Registration date.
- Award Miles balance.
- Lifetime Award Miles.
- Current membership tier.
- Qualification counters.
- Flight statistics.
- Account status.

Password handling:
- Do not store plaintext passwords.
- Do not request a password unless an actual authentication requirement exists.
- Discord identity should be the default account authentication mechanism.
- If additional password authentication is required for the dashboard, use secure password hashing and appropriate authentication controls.

Prevent duplicate accounts.

## 5.2 `/miles`

Purpose: Display the member's loyalty account.

Use one simple native Discord embed.

Display:
- Member name.
- Membership number.
- Current membership tier.
- Available Award Miles.
- Lifetime Award Miles.
- Total completed flights.
- Points.
- Qualifying Points.
- HON Circle Points.
- Progress to the next membership tier.
- Remaining qualification requirements.

If the member has reached the highest configured tier, display that clearly.

Do not create an oversized graphical profile card.

## 5.3 `/history`

Purpose: Display a member's transaction and activity history.

Include:
- Flight earnings.
- Daily rewards.
- Promotional bonuses.
- Staff adjustments.
- Reward deductions.
- Refunds.
- Reversed transactions.
- Other configured mileage changes.

Each entry must show:
- Transaction type.
- Amount.
- Date.
- Description.
- Related flight or redemption ID, if applicable.
- Resulting balance where available.

Provide pagination.

Members can view their own history.

Staff may inspect another member's history only with the appropriate permission.

## 5.4 `/leaderboard`

Purpose: Display member rankings.

Support configurable ranking categories:
- Available Award Miles.
- Lifetime Award Miles.
- Total flights.
- Qualification Points.
- HON Circle Points.
- Configured achievements.

Requirements:
- Paginate results.
- Display member positions.
- Resolve Discord usernames safely.
- Exclude deleted or suspended accounts as appropriate.
- Respect privacy settings.
- Never expose private member information.

## 5.5 `/help`

Purpose: Explain how to use the bot.

Organize commands by:
- Member commands.
- Flight commands.
- Staff commands.
- Administrator commands.
- Premium functionality.

Show only commands relevant to the user's permissions.

Include concise explanations and examples.

## 5.6 `/privacy`

Purpose: Display account privacy information and available privacy actions.

Explain:
- What information is stored.
- Why it is stored.
- How flight and mileage records work.
- How members can request account deletion.
- What records may need to be retained for system integrity.

Do not expose another member's private data.

## 5.7 `/premium`

Purpose: Display Premium functionality and entitlement status.

Show:
- Whether the server has Premium.
- Available Premium features.
- Active features.
- Inactive or unavailable features.
- Expiration information, if supported.

Do not invent payment or subscription integrations.

If Premium is manually managed, clearly indicate that.

## 5.8 `/claim`

Purpose: Allow passengers to claim Award Miles for a registered flight.

Parameter:
- `code`: Flight claim code.

Workflow:

1. Member enters a valid flight claim code.
2. Retrieve the associated flight.
3. Check whether the flight exists.
4. Check whether claims are open.
5. Check whether the claim deadline has passed.
6. Check whether the member has already claimed.
7. Check whether the member has a registered loyalty account.
8. Determine the member's eligible cabin class.
9. Calculate the mileage.
10. Calculate qualification credits.
11. Apply eligible bonuses.
12. Record the transaction.
13. Update member balances.
14. Mark the member as a passenger on the flight.
15. Send a confirmation embed.

The confirmation should show:
- Flight number.
- Origin and destination.
- Cabin.
- Award Miles earned.
- Qualification credits earned.
- Updated Award Miles balance.

Prevent duplicate claims.

If the flight is closed, expired or invalid, explain why the claim failed.

Do not allow passengers to choose an arbitrary flight distance or cabin to manipulate earnings.

## 5.9 `/daily`

Purpose: Allow members to claim configured daily rewards.

Workflow:

1. Check whether daily rewards are enabled.
2. Check the member's last claim timestamp.
3. Enforce the configured cooldown.
4. Calculate the reward.
5. Apply any valid streak bonus.
6. Credit Award Miles.
7. Update streak information.
8. Record the transaction.
9. Display the result.

Display:
- Award Miles received.
- Current streak.
- Next eligible claim time.
- Any applicable bonus.

Use a configurable timezone and cooldown system.

Do not allow repeated claims through simultaneous requests.

## 5.10 `/achievements`

Purpose: Display member achievements.

Show:
- Unlocked achievements.
- Locked achievements.
- Progress towards locked achievements.
- Reward attached to each achievement.
- Unlock date.

Support pagination if necessary.

Do not reveal hidden achievements if they are configured as secret.

## 5.11 `/event status`

Purpose: Display currently active loyalty events.

Show:
- Event name.
- Description.
- Start time.
- End time.
- Mileage bonus.
- Eligibility.
- Event status.

If no events are active, state that clearly.

## 5.12 `/shop`

Purpose: Display available rewards.

Show:
- Reward name.
- Description.
- Award Miles cost.
- Availability.
- Stock.
- Eligibility requirements.

Allow pagination and category selection.

Do not display unavailable rewards as redeemable.

## 5.13 `/redeem`

Purpose: Redeem an available reward.

Parameter:
- `reward`: Reward selection.

Workflow:

1. Retrieve reward.
2. Check availability.
3. Check stock.
4. Check eligibility.
5. Check Award Miles balance.
6. Prevent duplicate submissions.
7. Reserve or deduct Award Miles according to the configured redemption policy.
8. Create redemption record.
9. Update inventory.
10. Notify the member.
11. Notify the configured staff channel.

Show:
- Reward.
- Cost.
- Remaining Award Miles.
- Redemption reference.
- Fulfilment status.

The transaction must be atomic.

A member must not be charged twice for one redemption.

## 5.14 `/daily`, `/claim`, `/redeem` shared rules

All member earning and spending commands must:
- Use the same mileage transaction service.
- Record transactions consistently.
- Respect account status.
- Respect privacy and permissions.
- Prevent duplicate processing.
- Handle database failures safely.

---

# 6. STAFF AND ADMINISTRATION COMMANDS

## 6.1 `/adjust add`

Purpose: Manually credit Award Miles to a member.

Parameters:
- `member`: Target Discord member.
- `amount`: Positive integer.
- `reason`: Required explanation.

Workflow:
1. Check staff permission.
2. Validate member account.
3. Validate positive amount.
4. Credit Award Miles.
5. Record the staff member responsible.
6. Record the reason.
7. Record timestamp and transaction ID.
8. Send confirmation.
9. Send an audit entry to the configured log channel.

Do not change qualification Points unless explicitly supported by a separate authorized adjustment mechanism.

## 6.2 `/adjust remove`

Purpose: Manually debit Award Miles.

Parameters:
- `member`.
- `amount`.
- `reason`.

Requirements:
- Check staff permission.
- Prevent unauthorized negative balances.
- Allow exceptional negative balances only if explicitly configured.
- Record the full audit trail.
- Notify the affected member appropriately.

## 6.3 `/flight log`

Purpose: Create a new flight available for member claims.

Parameters:
- `flight_number`.
- `origin`.
- `destination`.
- `crew`.
- `claim_minutes`.

Workflow:
1. Validate staff permissions.
2. Validate flight number.
3. Resolve the route.
4. Retrieve or calculate distance.
5. Generate a unique flight ID.
6. Generate a secure claim code.
7. Save flight configuration.
8. Set the claim deadline.
9. Notify the configured flight announcement channel.
10. Display the claim code to authorized crew/staff.

Store:
- Flight ID.
- Flight number.
- Origin.
- Destination.
- Distance.
- Distance unit.
- Crew members.
- Creation timestamp.
- Claim deadline.
- Claim code.
- Flight status.
- Passenger list.
- Earning configuration snapshot.

Never expose private staff-only claim management information to unauthorized members.

## 6.4 `/flight add`

Purpose: Manually add a passenger to an existing flight.

Parameters:
- `flight_id`.
- `member`.
- `cabin`.

Workflow:
1. Check permissions.
2. Find flight.
3. Validate passenger account.
4. Validate cabin.
5. Check whether passenger has already claimed.
6. Calculate earnings.
7. Add passenger.
8. Credit balances.
9. Record the transaction.
10. Audit the staff action.

Allow manual addition after the claim window has closed.

Do not bypass all earning validations simply because a staff member is using the command.

## 6.5 `/flight close`

Purpose: Close passenger claims for a flight.

Parameter:
- `flight_id`.

Effects:
- Set flight status to closed.
- Prevent new normal passenger claims.
- Preserve existing passengers and earnings.
- Preserve flight history.

Staff may still use `/flight add` if authorized.

## 6.6 `/flight codes`

Purpose: Retrieve claim codes for authorized staff.

Display:
- Flight ID.
- Flight number.
- Claim code.
- Claim status.
- Deadline.

Never expose claim codes through public channels.

## 6.7 `/flight info`

Purpose: Display complete flight information.

Show:
- Flight number.
- Route.
- Distance.
- Crew.
- Claim deadline.
- Claim status.
- Passenger count.
- Passenger list, subject to permissions.
- Total Award Miles issued.

## 6.8 `/flight remove`

Purpose: Remove a passenger from a flight.

Parameters:
- `flight_id`.
- `member`.
- `reason`.

Effects:
- Remove passenger association.
- Reverse the original flight Award Miles transaction.
- Reverse qualification credits earned from that flight.
- Record the reversal.
- Preserve the original transaction.
- Audit the staff action.

Do not simply delete historical transactions.

If the original earning was already spent, apply the configured reversal policy and report the result.

## 6.9 `/flight void`

Purpose: Cancel an entire flight and reverse its earnings.

Parameters:
- `flight_id`.
- `reason`.

Workflow:
1. Validate permission.
2. Retrieve flight.
3. Confirm cancellation.
4. Prevent further claims.
5. Reverse all associated passenger earnings.
6. Reverse qualification credits.
7. Record reversal transactions.
8. Mark flight as void.
9. Notify affected members.
10. Log the action.

Make this operation idempotent. Repeating it must never reverse the same earnings twice.

## 6.10 `/redemptions pending`

Purpose: Display outstanding reward redemptions.

Show:
- Redemption ID.
- Member.
- Reward.
- Cost.
- Submission date.
- Current status.

Only authorized staff can access this view.

## 6.11 `/redemptions fulfil`

Parameters:
- `redemption_id`.
- Optional `notes`.

Effects:
- Verify pending status.
- Mark redemption as fulfilled.
- Record staff member.
- Record fulfilment time.
- Notify member.
- Prevent duplicate fulfilment.

## 6.12 `/redemptions refund`

Parameters:
- `redemption_id`.
- `reason`.

Effects:
- Verify redemption is refundable.
- Restore Award Miles if previously deducted.
- Restore stock if appropriate.
- Mark redemption as refunded.
- Record the refund transaction.
- Notify member.
- Audit the action.

Never refund twice.

---

# 7. REWARD MANAGEMENT

## 7.1 `/reward add`

Purpose: Create a reward in the shop.

Parameters:
- `name`.
- `description`.
- `cost`.
- `stock`.
- `category`.
- Optional eligibility requirements.

Effects:
- Validate configuration.
- Create reward record.
- Make it visible in the shop.
- Record creator and timestamp.

Support unlimited stock when configured.

## 7.2 `/reward remove`

Parameters:
- `reward`.

Effects:
- Disable or archive reward.
- Prevent new redemptions.
- Preserve existing redemption records.
- Do not delete historical financial records.

If pending redemptions exist, warn the administrator and require an explicit decision.

---

# 8. ACHIEVEMENT MANAGEMENT

## 8.1 `/achievement add`

Create a custom achievement.

Parameters:
- Name.
- Description.
- Achievement type.
- Target value.
- Optional Award Miles reward.
- Visibility.
- Optional Premium restriction.

Supported achievement conditions should include:
- Number of flights.
- Lifetime Award Miles earned.
- Number of claims.
- Consecutive daily claims.
- Total achievements.
- Other implemented measurable loyalty milestones.

## 8.2 `/achievement edit`

Allow authorized administrators to modify:
- Name.
- Description.
- Target.
- Reward.
- Visibility.
- Enabled status.

Do not silently reset earned progress.

## 8.3 `/achievement remove`

Disable or archive the achievement.

Preserve historical unlock records.

## 8.4 `/achievement reset`

Restore the default achievement catalogue.

Before execution:
- Display a confirmation.
- Explain what will be reset.
- Preserve member achievement history unless the administrator explicitly selects a separate destructive reset option.

## 8.5 Achievement engine

Automatically evaluate achievements after relevant events:
- Flight claim.
- Daily reward.
- Mileage earning.
- Redemption.
- Other relevant activity.

Prevent duplicate unlocks and duplicate rewards.

---

# 9. MEMBERSHIP TIER MANAGEMENT

## 9.1 `/tiers add`

Create a custom membership tier.

Parameters:
- Name.
- Qualification requirements.
- Display order.
- Optional Discord role.
- Description.
- Benefits description.

Support multiple qualification conditions.

## 9.2 `/tiers remove`

Remove or archive a tier.

Before removal:
- Check members assigned to it.
- Check whether it is a required tier.
- Require an explicit replacement or migration decision.

Never silently remove member status records.

## 9.3 `/tiers rename`

Change the display name without corrupting:
- Member membership records.
- Historical status records.
- Role mappings.
- Qualification history.

Use stable tier IDs independent of display names.

## 9.4 `/tiers role`

Map a tier to a Discord role.

Validate:
- Role exists.
- Bot has permission to manage it.
- Role hierarchy allows assignment.

Synchronize membership roles when status changes.

## 9.5 `/tiers threshold`

Configure qualification requirements.

Support:
- Points.
- Qualifying Points.
- HON Circle Points.
- Multiple conditions.
- AND/OR conditions where appropriate.
- Qualification periods.

The system must not assume all tiers use one simple Award Miles threshold.

---

# 10. ROUTE MANAGEMENT

## 10.1 `/route set`

Parameters:
- Origin airport.
- Destination airport.
- Distance.
- Distance unit.

Create or update a route.

Use normalized airport identifiers where possible.

Prevent duplicate route records.

## 10.2 `/route check`

Parameters:
- Origin.
- Destination.

Display:
- Airport codes.
- Airport names if available.
- Route distance.
- Distance unit.
- Whether the route is configured.

## 10.3 `/route list`

Display configured routes with pagination.

## 10.4 `/route remove`

Remove or deactivate a route.

Do not modify historical flights using that route.

Preserve flight earning snapshots.

## 10.5 Distance handling

Use consistent units.

Support:
- Kilometres.
- Nautical miles.
- Statute miles.

Store the original unit and normalized distance.

Use one documented conversion method.

Never silently treat kilometres as nautical miles.

---

# 11. ALLIANCE MANAGEMENT

Alliances represent partnerships between participating Discord airline communities.

## 11.1 `/alliance create`

Parameters:
- Alliance name.
- Description.
- Optional logo.

Effects:
- Create alliance.
- Assign creator as leader.
- Generate unique invitation code.
- Save alliance membership.

Apply Premium entitlement if required.

## 11.2 `/alliance code`

Display the alliance invitation code to authorized leaders.

Allow code regeneration.

When regenerated, invalidate the previous code.

## 11.3 `/alliance join`

Parameter:
- Invitation code.

Validate:
- Code exists.
- Alliance is active.
- Server is not already a member.
- Joining is permitted.

Record joining server and timestamp.

## 11.4 `/alliance info`

Display:
- Alliance name.
- Leader.
- Member airlines.
- Partner earning rate.
- Membership status.

## 11.5 `/alliance kick`

Parameters:
- Member airline.
- Reason.

Only alliance leaders or authorized administrators may remove members.

## 11.6 `/alliance leave`

Remove the current server from its alliance.

Preserve historical partnership earnings.

## 11.7 `/alliance rate`

Configure partner mileage earning rates.

Validate permitted percentage range.

Record who changed the rate.

Apply new rates only to future eligible transactions unless a deliberate recalculation is requested.

Do not allow alliance bonuses to be duplicated or exploited.

---

# 12. BRANDING COMMANDS

Branding controls the appearance of bot embeds and messages.

## `/branding color`

Set primary embed colour.

Validate colour format.

## `/branding emoji set`

Set a custom emoji for a supported bot element.

Validate emoji availability and bot access.

## `/branding emoji reset`

Restore the default emoji.

## `/branding footer`

Set the default embed footer.

## `/branding logo`

Set the branding logo URL or supported attachment.

Validate image URL and format.

## `/branding name`

Set the displayed programme or airline name.

## `/branding nickname`

Set the bot's Discord nickname where permissions permit.

Apply Premium entitlement if appropriate.

## `/branding reset`

Restore default branding.

Show a confirmation first.

Do not delete unrelated server configuration.

Branding settings should be used consistently across embeds.

---

# 13. CUSTOM BOT

## `/custombot setup`

Provide a secure configuration workflow for an authorized custom bot integration.

Validate the bot/application configuration.

Never request or expose secrets in public messages.

Store tokens using the safest available secret-management approach.

Do not log tokens.

## `/custombot status`

Show:
- Connection status.
- Bot identity.
- Last successful check.
- Configuration validity.

Do not reveal secrets.

## `/custombot remove`

Disconnect the integration and remove its active credentials securely.

Preserve unrelated loyalty data.

---

# 14. EVENTS

## `/event start`

Create an event.

Parameters:
- Name.
- Description.
- Award Miles multiplier or bonus.
- Start time.
- End time.
- Eligible members or flights.
- Optional restrictions.

Validate time ranges and overlapping event behaviour.

## `/event stop`

Stop an active event.

Record the administrator and timestamp.

Do not retroactively change completed transactions.

## `/event status`

Display active and scheduled events.

Event calculations must be reproducible and recorded in transaction metadata.

---

# 15. UNIFIED `/setup` WIZARD — MANDATORY

There must be one primary setup command.

`/setup`

Do not require administrators to learn or execute numerous individual setup commands.

The wizard must configure the entire loyalty system through a guided Discord interaction.

It is both:
- Initial onboarding.
- Ongoing configuration management.

## 15.1 Entry behaviour

When an administrator runs `/setup`:

1. Verify administrator permissions.
2. Load existing configuration.
3. Determine whether setup has never been completed, is incomplete or is already active.
4. Open the appropriate wizard screen.

If setup is new, show a welcome screen.

If setup is incomplete, offer to resume.

If setup is complete, display a configuration overview with editable sections.

Never reset existing configuration automatically.

## 15.2 Wizard screen design

Use Discord-native:
- Embeds.
- Buttons.
- Select menus.
- Role selectors.
- Channel selectors.
- Modals.

Each screen must contain:
- Section title.
- Brief explanation.
- Current setting.
- Available choices.
- Validation feedback.
- Progress indicator.
- Navigation controls.

Navigation:
- Previous.
- Next.
- Skip.
- Save.
- Cancel.
- Resume.
- Review.

## 15.3 Exact setup sections

### A. Airline identity

Configure:
- Display name.
- Programme name.
- Logo.
- Primary colour.
- Secondary colour.
- Embed footer.
- Custom emojis.
- Bot nickname.

Use Lufthansa-inspired defaults, but allow configuration.

### B. Membership tiers

Configure:
- Member tier.
- Frequent Traveller.
- Senator.
- HON Circle.
- Qualification thresholds.
- Qualification periods.
- Discord role mappings.
- Display benefits.

Validate all role assignments.

### C. Earning rules

Configure:
- Distance mode or flat mode.
- Base earning.
- Economy multiplier.
- Premium Economy multiplier.
- Business multiplier.
- First Class multiplier.
- Crew earning.
- Points rules.
- Qualifying Points rules.
- HON Circle Points rules.
- Rounding.
- Optional membership bonuses.

Explain the difference between Award Miles and status qualification currencies.

### D. Flight management

Configure:
- Flight staff roles.
- Claim deadline.
- Claim channel.
- Flight log channel.
- Default cabin rules.
- Crew permissions.
- Route handling.
- Manual passenger addition permissions.

### E. Permissions and logging

Configure:
- Administrator roles.
- Staff roles.
- Mileage adjustment permissions.
- Flight management permissions.
- Reward management permissions.
- Redemption permissions.
- Audit log channel.

### F. Rewards shop

Configure:
- Shop enabled/disabled.
- Reward categories.
- Redemption channel.
- Fulfilment staff.
- Refund policy.
- Inventory behaviour.

### G. Daily rewards and achievements

Configure:
- Daily reward activation.
- Base reward.
- Cooldown.
- Streaks.
- Streak bonus.
- Achievement activation.
- Achievement rewards.

### H. Events and alliances

Configure:
- Events enabled/disabled.
- Event permissions.
- Alliance functionality.
- Alliance permissions.
- Partner earning settings.

### I. Premium features

Show all Premium features and their availability.

Do not allow activation without valid entitlement.

### J. Final review

Show every configured section.

Identify:
- Required missing values.
- Optional skipped values.
- Invalid settings.
- Active features.
- Unavailable Premium features.

Allow editing any section.

Only activate the loyalty system when all critical settings are valid.

## 15.4 Wizard persistence

Store:
- Wizard session ID.
- Administrator ID.
- Current section.
- Completed sections.
- Pending changes.
- Existing configuration snapshot.
- Last activity.
- Session status.

Autosave progress.

A cancelled or abandoned session must not corrupt the active configuration.

Use safe configuration updates.

## 15.5 Editing after activation

Running `/setup` again must not launch a destructive first-time setup.

Show a configuration dashboard with selectable sections.

The administrator can edit:
- Branding.
- Membership.
- Earning.
- Flights.
- Permissions.
- Rewards.
- Daily rewards.
- Events.
- Alliances.
- Premium.

Save individual changes without forcing the administrator through every section.

## 15.6 Remove redundant setup commands

Migrate the functionality of:
- `/setup daily`
- `/setup earning`
- `/setup log-channel`
- `/setup staff-role`
- `/setup view`
- `/setup wizard`

into the unified `/setup`.

Remove the redundant slash command registrations only after verifying that their functionality is accessible through the new wizard.

Do not delete the underlying configuration services.

---

# 16. MILEAGE ENGINE — IMPLEMENTATION RULES

Create one authoritative mileage calculation service.

Every earning source must use it:
- Flight claims.
- Manual flight additions.
- Daily rewards.
- Promotions.
- Events.
- Staff adjustments where applicable.
- Alliance bonuses.

The service must return a structured calculation breakdown.

For a flight:

1. Retrieve flight distance.
2. Normalize distance.
3. Determine earning mode.
4. Retrieve cabin multiplier.
5. Apply eligible configured bonuses.
6. Calculate Award Miles.
7. Calculate qualification Points.
8. Calculate Qualifying Points.
9. Calculate HON Circle Points where eligible.
10. Apply rounding rules.
11. Return calculation details.
12. Persist the transaction and configuration snapshot.

Do not assume all qualification currencies use the same multiplier.

Keep each currency's earning formula independently configurable.

A completed flight must preserve the original earning calculation even if configuration changes later.

---

# 17. DATABASE AND TRANSACTION REQUIREMENTS

Use the existing database architecture unless it is demonstrably unsuitable.

Implement or verify persistent records for:

- Members.
- Membership tiers.
- Membership history.
- Flights.
- Flight passengers.
- Flight claim codes.
- Routes.
- Mileage transactions.
- Qualification transactions.
- Rewards.
- Redemptions.
- Achievements.
- Member achievements.
- Events.
- Alliances.
- Alliance membership.
- Branding configuration.
- Server configuration.
- Premium entitlements.
- Setup sessions.
- Audit logs.

Use stable IDs.

Do not rely on display names as primary identifiers.

All mileage changes must have a transaction record.

Do not delete historical transactions when correcting errors.

Use reversal transactions.

Use atomic database operations or transactions where required.

Prevent:
- Duplicate claims.
- Duplicate daily rewards.
- Duplicate redemptions.
- Duplicate refunds.
- Duplicate fulfilment.
- Duplicate achievement rewards.
- Duplicate event bonuses.

---

# 18. SECURITY AND PERMISSIONS

Enforce permissions on the server side.

Never rely on hiding buttons or commands in the Discord interface as the only permission check.

Verify:
- Staff roles.
- Administrator roles.
- Bot role hierarchy.
- Server ownership where appropriate.
- Premium entitlements.
- Dashboard authentication.
- Database access.

Keep secrets out of:
- Public embeds.
- Logs.
- Error messages.
- Client-side code.
- Public database documents.

Review Firestore rules if Firestore is used.

Admin SDK access does not mean dashboard access is automatically secure.

---

# 19. DASHBOARD REQUIREMENTS

Inspect the existing dashboard before making changes.

If present, verify that it supports the loyalty system consistently.

Expected management areas:

1. Overview.
2. Members.
3. Membership tiers.
4. Flights.
5. Routes.
6. Mileage transactions.
7. Rewards.
8. Redemptions.
9. Achievements.
10. Events.
11. Alliances.
12. Branding.
13. Staff permissions.
14. Premium.
15. Configuration.

Requirements:
- Dashboard and Discord commands must share the same backend services.
- Changes must persist.
- Permission checks must be enforced.
- Data must refresh correctly.
- Sensitive information must remain protected.

Do not build a separate duplicate mileage engine for the dashboard.

---

# 20. USER EXPERIENCE AND EMBED DESIGN

Use a consistent Lufthansa Miles & More-inspired design language.

Use:
- Clear titles.
- Concise descriptions.
- Consistent colours.
- Meaningful status indicators.
- Readable fields.
- Consistent footers.
- Appropriate timestamps.
- Clear success and failure messages.

Avoid excessive fields and oversized embeds.

Use ephemeral responses for private or administrative information where appropriate.

Use public announcements only when the action is intended to be public.

Use buttons and menus only when they perform real actions.

---

# 21. TESTING AND ACCEPTANCE CRITERIA

The previous build report stated:
- 102 tests passed.
- 3 tests failed.

Investigate all three failures.

Do not dismiss them without inspecting the actual failures.

Test every command and every important interaction.

### Account tests
- Registration.
- Duplicate registration.
- Account lookup.
- Privacy.
- Account deletion.

### Mileage tests
- Flat earning.
- Distance earning.
- All cabin classes.
- Crew earning.
- Promotions.
- Events.
- Adjustments.
- Reversals.
- Rounding.

### Qualification tests
- Frequent Traveller AND conditions.
- Senator AND conditions.
- HON Circle qualification.
- Tier upgrades.
- Tier downgrades.
- Qualification period resets.
- Discord role synchronization.

### Flight tests
- Flight creation.
- Claim code generation.
- Successful claim.
- Invalid claim.
- Expired claim.
- Closed flight.
- Duplicate claim.
- Manual passenger addition.
- Passenger removal.
- Flight cancellation.

### Reward tests
- Shop listing.
- Insufficient balance.
- Successful redemption.
- Out-of-stock reward.
- Fulfilment.
- Refund.
- Duplicate processing.

### Setup tests
- First-time setup.
- Invalid configuration.
- Role selection.
- Channel selection.
- Skip.
- Previous.
- Resume.
- Cancel.
- Final review.
- Activation.
- Reconfiguration.
- Existing configuration preservation.
- Concurrent setup attempts.

### Security tests
- Unauthorized staff commands.
- Unauthorized buttons.
- Unauthorized dashboard actions.
- Invalid Premium access.
- Secret exposure.
- Database access.

Do not claim production readiness while critical tests are failing.

---

# 22. IMPLEMENTATION ORDER

Work in this order.

**PHASE 1 — Repository audit**
- Inspect all files.
- Inspect commands.
- Inspect database.
- Inspect dashboard.
- Inspect tests.
- Produce an internal gap checklist.

**PHASE 2 — Core system integrity**
- Member accounts.
- Mileage transaction engine.
- Qualification engine.
- Routes.
- Flight management.

**PHASE 3 — Member functionality**
- Registration.
- Miles.
- History.
- Leaderboard.
- Claim.
- Daily.
- Shop.
- Redeem.
- Achievements.

**PHASE 4 — Administration**
- Adjustments.
- Flight management.
- Redemptions.
- Rewards.
- Tier management.
- Routes.
- Branding.

**PHASE 5 — Advanced functionality**
- Events.
- Alliances.
- Premium.
- Custom bot.
- Advanced achievements.

**PHASE 6 — Unified setup**
- Implement the full interactive `/setup` wizard.
- Migrate existing setup functionality.
- Add resume and reconfiguration.
- Remove redundant setup command registrations.

**PHASE 7 — Dashboard and security**
- Verify shared services.
- Fix authorization.
- Review data protection.

**PHASE 8 — Full testing**
- Run tests.
- Fix failures.
- Verify every command.
- Verify interactions.
- Verify database consistency.

**PHASE 9 — Final report**
- Provide exact completion status.
- List remaining work.
- Provide administrator setup instructions.

Do not stop after Phase 1 or return only a plan. Continue implementing until the available scope is complete.

If context or execution limits prevent completion, finish the current safe unit of work, document exactly what remains, and continue in subsequent sessions without repeating completed work.

---

# 23. FINAL DELIVERY REPORT

Provide:

1. Repository changes made.
2. Complete command inventory.
3. Each command's implemented parameters and behaviour.
4. Setup wizard walkthrough.
5. Database changes and migrations.
6. Mileage calculation examples.
7. Qualification calculation examples.
8. Dashboard functionality.
9. Premium functionality.
10. Security review.
11. Test results.
12. Known limitations.
13. Exact administrator actions still required.

For every feature, use one status:

- VERIFIED COMPLETE
- IMPLEMENTED — NOT FULLY VERIFIED
- INCOMPLETE
- NOT IMPLEMENTED
- BLOCKED

Provide evidence for VERIFIED COMPLETE.

Never describe a placeholder, mockup or untested handler as complete.

# FINAL DIRECTIVE

Build the actual product.

Do not spend time asking the founder to design routine implementation details already specified here.

Do not stop at recommendations.

Do not create placeholder commands.

Do not silently omit functionality.

Do not replace working code unnecessarily.

Make reasonable technical decisions, implement them, test them and document them.

The expected result is a fully functional Lufthansa Miles & More-inspired Discord loyalty system with a complete member experience, comprehensive administration, reliable mileage accounting, rewards, membership qualification, Premium functionality and one unified interactive `/setup` wizard.