# Microsoft Teams — Complete Feature Catalog

## Part 1 · Teams, Channels & Chat + Apps & Platform

### Teams (Containers)

- **Private teams**: Teams restricted to invited members only; conversations, files and notes are visible only to members, and owners approve or add members.
- **Public teams**: Open teams anyone in the organization can join without approval, up to the 10,000-member team limit.
- **Org-wide teams**: Auto-membership team containing everyone in the tenant (orgs up to 10,000 users); membership syncs automatically as people join or leave the org.
- **Microsoft 365 group backing**: Every team is built on a Microsoft 365 Group; a team can be created from an existing group and membership changes in the group sync to the team automatically.
- **Team roles (owner/member/moderator)**: Owners manage settings, membership and invitations and can promote members to co-owner; members participate; moderator is a third per-channel capability owners can assign.
- **Owner-controlled team settings**: Team picture, member permissions for creating standard/private/shared channels, adding tabs/connectors/bots, @team and @channel mention allowance, and GIF/sticker/meme usage including Giphy content-rating.
- **Team creation paths**: Create a team from scratch, from an existing Microsoft 365 group, from an existing team (cloning channels and settings), or from a template.
- **Prebuilt team templates**: Microsoft-supplied templates (project management, event management, retail, healthcare, financial, government, manufacturing, etc.) that pre-provision channels, tabs and apps; the user picks a template, reviews channels/apps, and names the team.
- **Custom team templates**: Admins create templates from scratch, from an existing team, or by duplicating an existing template in the Teams admin center, and can hide/allow specific templates via template policies.
- **Team archiving**: Archive a team to make it read-only (all activity ceases, including private channels and their SharePoint sites) while keeping content viewable; owners/admins can still adjust membership, and archived teams can be reactivated (Restore).
- **Team deletion with 30-day restore**: Deleting a team removes channels, files and chats; admins can restore a deleted team within 30 days via "View deleted teams" in the admin center, which restores the backing M365 group.
- **Sensitivity labels on teams**: Teams can carry Microsoft Purview sensitivity labels controlling privacy and guest-access behavior; requires Microsoft Purview Information Protection licensing (e.g., M365 E3/E5 compliance plans).
- **Team creation permission control**: By default all users can create teams; admins can restrict creation via group-creation policies.
- **Teams admin center management**: Admins can create and manage teams tenant-wide, edit membership and roles, and view per-team analytics.

### Channels

- **Standard channels**: Open to every team member; conversations and files are searchable team-wide and stored in the parent team's single SharePoint site. Support moderation, scheduled channel meetings, Planner, bots/connectors/messaging extensions, tags, analytics, and "copy link to channel."
- **Private channels**: Membership limited to a subset of the team; files live in a separate, dedicated SharePoint site visible only to channel members. No moderation, no scheduled meetings, no bots/connectors/messaging extensions, no Planner; cannot be converted to standard or moved to another team.
- **Shared channels (Teams Connect)**: Membership can include people who are not team members, other teams, and people in other organizations via Microsoft Entra B2B Direct Connect cross-tenant trust. Dedicated SharePoint site; supports scheduled meetings and tags; guests cannot participate (external participants use their own tenant identity); only team owners can create them, and only shared-channel owners add members or share with teams.
- **Channel feature matrix specifics**: Only shared channels can be shared with other teams or the parent team; guests participate in standard/private but not shared channels; B2B direct-connect external participants only in shared channels; analytics available for standard/private but not shared channels.
- **General/default channel**: Every team starts with a default channel that cannot be deleted.
- **Channel creation permissions and limits**: Owners control which members may create each channel type; per-team limits apply (up to 1,000 standard/shared-class channels, 30 private channels, 200 shared channels per Microsoft documentation).
- **Channel archiving**: Individual channels can be archived to freeze activity while retaining content, and later restored.
- **Per-channel notification settings**: Users choose per channel whether to be notified of all new posts and/or all replies, or only personal mentions, with banner/feed granularity.
- **Auto-created SharePoint sites**: Creating a team creates a connected SharePoint team site; each private and shared channel creates its own separate site collection.
- **Copy link to channel / to message**: Deep links to a channel (standard channels only) or to a specific message for sharing elsewhere.
- **Channel info pane**: Shows members, pinned messages, and recent activity per channel.

### Guest and External (Federated) Access

- **Guest access**: Invite an individual outside the org as an Entra B2B guest; guests become near-full team members with access to channel conversations, chats, meetings, and team files. Requires per-person provisioning; admins can toggle granular guest capabilities (meetings, message edit/delete, media sharing). Included with Microsoft 365; guests consume no Teams license (Entra B2B billing applies for some premium guest features).
- **External access (federation)**: Tenant-level domain federation letting Teams users in other M365 tenants (and Skype for Business/Skype consumer) find, chat 1:1/group, call, and invite your users to meetings — with no access to your teams, channels or files; users remain in their own tenant. Allow/block lists by domain.
- **B2B Direct Connect (shared channels)**: External people participate in a shared channel from their own home tenant without tenant switching or a guest account; requires mutual cross-tenant access configuration in Entra ID on both tenants (no separate paid SKU).
- **External labeling**: Externally federated participants are labeled "External" in chat, with a restricted feature set compared to internal chat.

### Chat Basics and the Chat List

- **1:1, group, and meeting chats**: Persistent chat threads separate from channels; group chats support up to 250 people.
- **Chat with self**: A private self-chat for notes, drafts, and sending files to yourself.
- **Group chat naming and picture**: Group chats can be renamed and given an avatar for identification.
- **Add people with history control**: When adding someone to a group chat you can include no history, the last N days, or the full chat history.
- **Pin chats**: Pin chats to the top of the chat list (up to a set number); channels can also be pinned into the combined chat/channels list in new Teams.
- **Hide / mute / leave chat**: Hide removes a chat from the list without deleting it; mute stops its notifications; leave exits a group chat.
- **Pop-out chat windows**: Open any chat in a separate window.
- **Compact mode / chat density**: Settings → Appearance lets users pick "Comfy" or "Compact" message density.
- **Combined chat + channels experience**: Optional unified list of chats and channels with custom sections and filters (Unread, @mentions), plus a "Favorites" section.

### Composing and Formatting

- **Rich-text formatting**: Bold, italic, underline, strikethrough, highlight, font size/color, headings, bulleted/numbered lists, quotes, links, tables, and undo/redo via the expanded Format compose box.
- **Markdown support**: Live-preview markdown shortcuts (e.g., `*bold*`, backticks) while typing.
- **Code blocks and snippets**: Inline code and multi-line code blocks with language syntax highlighting, line numbers, and mobile rendering with wrapping.
- **Emoji, GIFs, stickers, memes**: Built-in emoji picker with skin-tone options, Giphy GIFs (admin-controllable content rating), and a sticker/meme library.
- **Custom emoji**: Organizations can upload custom emoji/reactions, admin-controlled.
- **Text predictions and suggested replies**: Editor-powered inline text predictions and AI suggested quick replies in chat.
- **Multi-language spell check**: Compose-box spell checking across multiple languages.
- **Attachments in compose**: Attach files from OneDrive or device, insert images/links; the "Actions and apps" (+) menu hosts messaging extensions such as Praise, Approvals, and polls.

### Mentions and Tags

- **@person mentions**: Notify a specific person; typing @ surfaces a people picker.
- **@team and @channel mentions**: Notify the whole team or everyone who has favorited the channel (owner-controllable permission).
- **@everyone in group chats**: Mentions all group-chat participants.
- **Custom tags**: Owner- (or member-, if allowed) created tags grouping team members; @tag notifies only those members. Limits: up to 200 tags per team, 200 members per tag, 25 tags per user per team; admin policy governs who can manage tags.
- **Shift-based tags**: Tags auto-assigned from Shifts schedule groups (e.g., @Cashiers); @mentioning the tag notifies only people currently on shift.
- **Automatic tags**: Tags auto-generated from department or job title attributes for targeting groups in channels (frontline scenarios).

### Threads, Replies and Channel Conversations

- **Posts layout (classic)**: Channel conversations with top-level posts and inline chronological replies; a per-conversation reply box keeps topics together.
- **Threads layout (new)**: Per-channel option for a chat-like flow where replies open in a dedicated side thread panel; users can reply "in thread only" or also send to the main channel view.
- **Followed threads view**: A single interactive list aggregating all threads a user follows across channels for triage without channel-hopping.
- **Subject lines on posts**: Channel posts can carry a bolded subject/title.
- **Message forwarding**: Forward chat messages, and forward channel posts/replies to any chat or channel (standard, private, and shared channels all supported) via More actions → Forward.

### Reactions and Message Actions

- **Reactions**: React to any message with the full emoji set (expanded beyond the original six), including custom emoji; reaction counts and hover details are shown.
- **Edit sent messages**: Hover → Edit, with an edited indicator; admin messaging policy can disable editing.
- **Delete sent messages**: Delete your own messages with an Undo option; owners can delete others' channel messages if allowed by policy.
- **Save/bookmark a message**: Private "Save this message" bookmark, retrieved from the Saved list (profile menu or typing /saved in search).
- **Mark as unread**: Flag a chat or message to return to later.
- **Pin a message**: Pin messages in a chat (kept at top for all participants) or in a channel so key info stays discoverable.
- **Copy link to message**: Get a deep link to a specific message.
- **Share to Outlook**: Send a copy of a chat/channel message to email via the built-in Share to Outlook action.
- **Report a message**: Flag inappropriate content, if enabled by the org.
- **Message link previews**: URLs unfurl to previews before and after sending.
- **Immersive message viewing**: Open long messages or posts in an expanded view.

### Delivery Options, Scheduling, Receipts

- **Important messages**: A "!" flag that highlights the message with a red marker and IMPORTANT banner.
- **Urgent messages**: Priority notification that re-alerts the recipient every 2 minutes for 20 minutes until read; gated by messaging policy.
- **Scheduled send**: Right-click the send button (or use the schedule action) to deliver a chat message at a chosen future date/time; editable or cancellable before delivery.
- **Read receipts**: Per-message seen/read indicators in 1:1 and small group chats (Microsoft documents 20 or fewer participants); user toggle plus admin messaging-policy control (on/off/user-controlled).
- **Delivery failure/resend indicators**: Failed messages show retry affordances.

### Translation and Accessibility

- **Inline message translation**: Translate a received chat/channel message into the user's preferred language via More actions → Translate; chat also supports translation suggestions and automatic translation settings.
- **Immersive Reader**: Opens any message full-screen with read-aloud, adjustable speed/voice, text spacing, syllables, parts-of-speech highlighting, picture dictionary, line focus, and on-the-fly translation.
- **Keyboard/screen-reader support and high contrast**: Full accessibility surface across chat.

### Polls, Clips and In-Chat Media

- **Polls**: Microsoft Forms-powered Polls app launched from the compose + menu in chats and channels — multiple choice, quiz, word cloud, rating and ranking question types, with live results posted into the conversation (replaces the older Forms meeting app for in-meeting/chat polling).
- **Video clips**: Record and send short camera video clips directly in chat, and since early 2025 in channel posts and replies, on desktop, web and mobile.
- **Audio clips**: Record voice messages in chat (mobile, and newer desktop clients).
- **Screen share from chat**: Start a screen-sharing session directly from a chat without a full call.

### Loop in Teams

- **Loop components in chat and channels**: Live-editable, portable components (task list, table, bulleted/numbered list, checklist, paragraph, Q&A, voting table) that everyone edits inline in the message and that stay in sync wherever they are shared — other chats, channels, Outlook, OneNote, Whiteboard, and the Loop app.
- **Loop component portability**: Components can be copied between chats, channels, and emails while remaining a single synced object.
- **Loop workspaces as channel tabs**: A full Loop workspace attached to a standard Teams channel; membership auto-syncs with channel membership (new team members get access automatically), with pages and components co-authored in near real time. Standard channels only; workspace invites/links are disabled because membership is Teams-governed.
- **Loop pages and components management in channels**: Channel-level management of Loop pages and components surfaced in the Teams UI.

### Presence and Status

- **Presence states**: Available, Busy, Do Not Disturb, Be Right Back, Away, Appear Offline, plus app-driven states (In a call, In a meeting, Presenting, Out of Office); auto-set from activity, calendar, and calls, or manually chosen.
- **Status duration**: Set any manual status with an expiry ("Reset status after" — 30 min, 1 hour, today, this week, custom); defaults: Busy/DND last one day, other manual states 7 days, Appear Offline indefinite.
- **Do Not Disturb with priority access**: DND suppresses banners but lets messages from designated "priority access" contacts through.
- **Status messages**: Free-text status note (with optional expiry) shown on hover/profile, with an option to "Show when people message me" so it displays in the compose box of anyone writing to you.
- **Out-of-office sync**: Out-of-office status and message sync from Outlook automatic replies and calendar.
- **Presence admin control**: Admins can configure whether presence is visible org-wide or per privacy settings.

### Activity Feed

- **Unified activity feed**: Timeline of @mentions, replies, reactions, followed channel posts, team-membership events, app notifications, missed calls and voicemail.
- **Feed filtering**: Filter by type (@mentions, replies, reactions, apps, missed calls) or keyword, with an unread-only toggle.
- **Mark all as read / mark item unread**: Bulk and per-item read-state control in the feed.
- **In-feed preview pane**: Click an activity item to read and respond in place.

### Notifications and Quiet Time

- **Granular notification settings**: Settings → Notifications and activity controls banner vs. feed vs. off per event type (mentions, replies, reactions, follows, apps), plus notification sounds (including distinct sounds for urgent/priority) and a "show message preview" toggle.
- **Mute all except calls/meetings**: Windows-only master mute switch.
- **Missed-activity email digests**: Email summaries of missed activity at a chosen cadence.
- **Meeting-started and calendar notifications**: Configurable alerts for meeting start, invites, and changes.
- **Quiet time (mobile)**: Block push notifications during set daily hours and/or entire days; the quiet-time schedule can sync across devices and with Outlook mobile ("Set on Teams and Outlook").
- **Per-chat and per-channel mute**: Silence individual conversations without affecting others.
- **DND integration with OS focus modes**: Presence-based suppression of notifications.

### Search and Filters

- **Global search**: Top search box spanning messages, people, files, and group chats, with tabbed results.
- **Search filters**: Narrow message results by From, date, chats vs. channels, and more; files by type/team/modified date.
- **In-conversation find**: Ctrl+F / "Find in chat" scoped search inside the current chat or channel.
- **Slash and @ commands in the search bar**: e.g., /saved, /unread, /goto, @person to send a quick message (a subset carried into new Teams).
- **People search / quick jump**: Type a name to jump straight to a chat.

### Channel Moderation, Announcements, Cross-Posting, Email

- **Channel moderation**: Owners can turn on moderation for standard channels so only moderators start posts; moderators (owners by default, plus assigned members) control whether members can reply and whether bots/connectors can post, and can add/remove other moderators.
- **Reply restrictions**: Even without full moderation, posts can be set so only the author and moderators reply; the General channel can be limited to owner-only posting.
- **Announcement posts**: Special post type with a large illustrated hero header, headline, subhead and colored background/image for high-visibility communication.
- **Cross-posting**: Compose once and publish the same post to multiple channels across multiple teams ("Post in other channels"), with the post appearing natively in each channel.
- **Email a channel**: Every standard channel can expose a unique email address ("Get email address"); mail sent there becomes a channel post with the email body and attachments. Admin-controllable (on/off, restrict sender domains); limits include ~50 inline images, 20 attachments, 10 MB per attachment; replies in Teams do not email back to the sender.

### Files, SharePoint/OneDrive Storage, Co-Authoring

- **Channel files → SharePoint**: Every file shared in a channel lands in the team's SharePoint document library (per-channel folder); private and shared channels use their own separate SharePoint sites with permissions auto-scoped to channel membership.
- **Chat files → OneDrive**: Files shared in 1:1/group chats upload to the sender's OneDrive ("Microsoft Teams Chat Files") and are auto-shared with chat participants.
- **Files tab per channel/chat**: Browsable file list at the top of each channel and chat; supports upload, new-file creation (Word/Excel/PowerPoint/OneNote), folder management, sync via the OneDrive sync client, "Open in SharePoint," and pinning files to the top.
- **Real-time co-authoring**: Word/Excel/PowerPoint files open inside Teams, in the browser, or in desktop apps with simultaneous multi-user editing, presence cursors, and changes syncing in seconds; comments and version history come from SharePoint/OneDrive.
- **File sharing controls**: Share links with org-wide, specific-people, or public scopes per tenant sharing policy; guests can access team files, external federated users cannot.
- **In-chat file previews**: Office documents, PDFs and media preview inline without leaving Teams.

### Tabs and Apps in Channels and Chats (User-Facing)

- **Default tabs**: Each channel gets Posts and Files (plus Notes/OneNote or wiki-successor options); each chat gets a Files tab and supports added tabs.
- **Add-a-tab (+)**: Pin apps as tabs in channels, group chats, and 1:1 chats — Planner (Tasks), Excel/Word/PowerPoint/PDF documents, OneNote, Lists, Forms, Whiteboard, Power BI, SharePoint pages/libraries, Stream, and thousands of third-party/custom apps.
- **Website tab**: Pin a URL as a tab (in new Teams the site opens in the browser; classic Teams rendered it in-app).
- **Tab management**: Rename, reorder, or remove tabs; tab conversations (a side-panel discussion attached to a tab) in channels.
- **App availability by channel type**: Private and shared channels support a restricted app set (no bots/connectors/messaging extensions in private channels).
- **Pin apps to the app bar**: Users and admins can pin apps to the left rail; admin setup policies control pinned order.

### Teams App Store and App Discovery

- **In-client Teams app store**: Users browse and search a catalog of validated apps directly in the Teams desktop and web client — by name, category, or curated sections; apps install without binary deployment (web/SaaS-based).
- **"Built for your org" section**: Custom line-of-business apps approved by admins appear in a dedicated org-catalog section so employees can discover internal apps.
- **"Built with Power Platform" section**: A store browse filter surfacing low-code apps built with Power Apps/Power Platform.
- **In-context app add**: Apps can be added directly from the surface where the user is working — chat, channel tab gallery, meeting, or message compose area — not only from the store.
- **App request/approval flow**: Apps blocked by admin show a lock icon; users can send an in-store request to IT, and once approved can install the app.
- **Third-party SaaS subscription purchase**: Apps with linked SaaS offers can be purchased in the Teams admin center, with license buy/assign/remove workflows for third-party app subscriptions.
- **Microsoft app validation and the Microsoft 365 App Compliance Program**: Store apps pass mandatory functional/security validation, with optional multi-tier compliance certification (Publisher Attestation, M365 Certification) admins can inspect.
- **Apps that run across Microsoft 365**: The same Teams app manifest can light up in Outlook and the Microsoft 365 app (office.com), so one app runs in Teams, Outlook, and the M365 App; governed via Integrated Apps in the M365 admin center.
- **App templates for Teams**: Microsoft ships open-source, production-ready sample apps (adoption.microsoft.com App Templates) that organizations can rebrand, extend, and deploy as custom apps.

### Core App Capabilities (Developer Platform)

- **Tabs (channel/group and personal)**: Teams-aware webpages (iframes) pinned at the top of a channel, group chat, or as a personal app; the platform supports configurable tabs, static (personal) tabs, and full web-app experiences scoped to personal, group chat, or team contexts.
- **Bots / conversational bots**: Apps that converse in personal chat, group chat, or channels; support quick Q&A through complex dialogs, proactive messaging, and command menus.
- **Message extensions (search commands)**: Search an external system from the compose box or command box and insert results as rich cards into a message.
- **Message extensions (action commands)**: Act on an existing message or launch a dialog (task module) from compose/message context menus to run a short workflow and post the result.
- **API-based message extensions**: Message extensions built from an OpenAPI specification that Teams queries directly — no bot backend required (lower customization, no code to host).
- **Bot-based message extensions**: Traditional message extensions backed by a bot for full control of query handling and card rendering.
- **Incoming webhooks**: Per-channel HTTP endpoints letting external services post cards/messages into a channel.
- **Outgoing webhooks**: Channel-scoped @mention-triggered HTTP callbacks that send the message text to an external service and post the response back.
- **Office 365 Connectors (retiring)**: Legacy service-to-channel notification connectors being retired (connector webhooks disabled mid-2026), with migration to Workflows-based webhooks that accept both MessageCard and Adaptive Card payloads (custom bot icon/name not supported on the Workflows path).
- **Cards and dialogs (task modules)**: Rich card types (Adaptive, hero, thumbnail, list, receipt, connector cards) plus modal pop-up dialogs for forms, videos, or embedded pages (e.g., Power BI).
- **Activity feed integration**: Apps can post notifications into the Teams Activity feed via Graph activity-feed APIs, with deep links into tab/bot/card content; users control which app notifications they see.
- **Personal apps**: Single-user app experiences combining a static tab and/or bot in the left rail.
- **Deep links and Share-to-Teams**: Deep links to tabs, chats, channels, meetings, and app content; a Share-to-Teams embed lets external websites share content into Teams.
- **Stageview / Collaborative Stageview**: APIs to open app content in a large modal or a new multitask window with a side-by-side conversation panel for collaborating on the content.
- **Link unfurling**: Message extensions can unfurl pasted URLs from a registered domain into rich cards in the compose box.
- **App caching**: Tab apps can opt into caching to cut relaunch time, notably in meetings.
- **Teams JavaScript client library (TeamsJS)**: Client SDK giving apps context (user, theme, locale, host), auth (SSO with Entra ID), dialog, sharing, and host-capability APIs across Teams/Outlook/M365.
- **Resource-specific consent (RSC)**: Granular permission model where team owners (or chat members) consent to an app accessing only that specific team's or chat's data (e.g., sending channel messages, reading membership) instead of tenant-wide Graph consent.

### Adaptive Cards

- **Adaptive Card rendering in chats, channels, dialogs, tabs**: JSON-defined declarative card UI with text blocks, images, containers, fact sets, and input controls rendered natively by Teams.
- **Universal Actions (Action.Execute)**: A common bot-backed action model so the same card actions work across Teams and Outlook; enables role-based card views and sequential workflows.
- **User-specific views and up-to-date cards**: With Universal Actions, a card can render differently per user and refresh automatically so viewers always see current state.
- **Typeahead search (Input.ChoiceSet)**: Static and dynamic typeahead search inside a card's choice control, including datasets loaded dynamically from a backend.
- **People Picker input**: A card input control to search and select single or multiple users (org-wide or scoped), usable in chats, channels, dialogs, and tabs.
- **Adaptive Card Previewer**: Visual Studio Code tooling to live-preview Adaptive Cards while authoring.
- **Full-width cards, card actions, markdown/formatting support**: Layout and formatting options specific to Teams' Adaptive Card host.

### Meeting Apps / Stage Apps

- **Meeting lifecycle surfaces**: Apps can appear pre-meeting (details tab, chat tab), in-meeting (side panel and meeting stage), and post-meeting (recap/details tab), with distinct experiences per stage.
- **In-meeting side panel**: A narrow app panel inside the meeting window for agendas, polls, notes, and controls.
- **Share app to meeting stage**: The `shareAppContentToStage` API lets a presenter push app content to the main meeting stage for all participants to see and interact with in real time.
- **In-meeting notifications/dialogs**: Apps can raise targeted in-meeting dialogs and notifications to participants (e.g., a poll popup).
- **Meeting apps APIs**: Get-participant API (role/user type of any participant), user context API, and real-time meeting start/end event notifications.
- **Supported meeting types**: Scheduled meetings, scheduled channel meetings, one-on-one and group calls, Meet now instant meetings, webinars, and PSTN calling contexts; not supported in E2E-encrypted calls, instant channel meetings, or shared-channel meetings.
- **Role- and user-type-aware apps**: Apps distinguish organizer/presenter/attendee roles and in-tenant/guest/federated/anonymous user types; only organizers and presenters can add or remove meeting apps.
- **Live Share SDK**: Turns meeting apps into real-time multi-user collaborative experiences (co-watch, co-edit, synchronized media, shared canvas, ephemeral state) with a free managed Azure Fluid Relay backend — no custom backend code; works in meetingStage, sidePanel, and chat/channel tab contexts.
- **Together Mode custom scenes (Scene Studio)**: A Scene Studio hosted in the Developer Portal to build custom Together Mode scenes with imported visual assets, participant seat counts, and role-reserved seats.
- **Share in Meeting button**: Documents/app content on websites can carry a "Share in meeting" affordance to bring content onto the stage of an ongoing meeting.
- **Custom meeting apps in sovereign clouds**: LOB meeting/call apps supported in GCC, GCC High, DoD, and 21Vianet; third-party meeting apps in GCC only.

### Workflows (Power Automate in Teams)

- **Workflows app**: A first-party app to browse, create, and manage Power Automate flows entirely inside Teams; every workflow is a Power Automate flow under the hood.
- **Template gallery**: Template-driven creation (e.g., daily schedule chat message, meeting-takeaway summaries, notify a channel when a SharePoint item changes, forward emails to a channel).
- **Contextual workflow creation**: Launch workflows from the compose "Actions and apps" menu, from a message's "..." overflow menu, or on a channel/chat, with the target chat/channel pre-bound.
- **Instant (button) flows in messages**: Run manual flows on a selected message (e.g., create a task from a message, save a message to OneNote).
- **Webhook-triggered workflows**: The "When a Teams webhook request is received" trigger issues a webhook URL external systems post to, and the flow posts a message or Adaptive Card into a channel or chat — the successor to Office 365 Connectors/incoming webhooks; supports private channels.
- **Adaptive Card posting and approval flows**: Flows can post cards, wait for card responses, and run approval processes in Teams.
- **Flow management homepage**: See flows tied to Teams, which team/channel each affects, and run history; toggle/edit flows, with an "Edit in Power Automate" escape hatch opening the full designer for conditions and advanced steps.
- **Power Automate Actions app**: A related Microsoft app enabling flow actions inside Teams (listed in the Microsoft-provided app catalog).

### Power Apps and Dataverse for Teams

- **Dataverse for Teams**: A built-in low-code relational data platform provisioned per team (environment auto-created on first app build/install) storing team-scoped tables, apps, flows, and bots. Included with most Microsoft 365 subscriptions at no extra cost (capacity-limited vs. full Dataverse).
- **Power Apps app for Teams**: Build and publish canvas apps entirely inside Teams via an embedded maker studio, pinned as tabs or personal apps — no separate portal needed.
- **Sample/template apps**: Ready-made Dataverse-for-Teams apps (e.g., Inspection, Issue reporting, Employee ideas, Milestones, Bulletins, Perspectives) installable and customizable per team.
- **Copilot Studio (Power Virtual Agents) bots in Teams**: Build no-code chatbots scoped to a team that answer questions, route requests, and trigger flows in channels and chat.
- **Power Automate on Dataverse for Teams**: Flows can trigger on Dataverse-for-Teams table events, form submissions, Teams messages, or schedules.
- **Power BI app in Teams**: A first-party app for viewing and sharing Power BI reports and dashboards in tabs and as a personal app.
- **Upgrade path**: Dataverse for Teams environments can be promoted to full Dataverse when scale or features demand it (full Power Apps licensing then applies).

### App Governance, Policies and Admin Controls

- **Manage apps page (Teams admin center)**: Org-level allow/block per app, app status/properties/permissions/certification info, custom app upload, and org-wide app settings.
- **App centric management**: Per-app availability assignment — Everyone, specific users/groups, or No one — replacing legacy app permission policies (tenants auto-migrated from April 2025; migration irreversible).
- **App permission policies (legacy)**: Per-user policies controlling which Microsoft/third-party/custom apps users may install; superseded by app centric management.
- **App setup policies**: Admin-controlled pinning and install — pin apps in a fixed order to the app bar/messaging area, auto-install apps for targeted users, and allow/disallow user pinning.
- **Custom app policies and settings**: Org-wide and per-user controls on whether custom apps can be uploaded or interacted with; custom app upload ("sideloading") gating.
- **Teams App Submission API**: Developers submit custom apps programmatically via Graph into an admin approval queue; admins review, approve, and publish from the admin center.
- **Org-wide app settings**: Tenant toggles for third-party apps, new-app auto-allow, custom apps, and (formerly) connectors.
- **Blocked app lock and user request approvals**: Admin approval workflow for user app requests, managed in the admin center.
- **Permissions and consent review**: Admins can review Graph/RSC permissions requested by each app and grant tenant-wide admin consent from the app's Permissions tab.
- **Built-in Teams agents management page**: Dedicated admin page (Teams apps > Built-in Teams agents) governing embedded agents like Channel Agent and Facilitator, which don't install from the store.
- **Policy packages**: Predefined policy bundles (e.g., Frontline Worker, Frontline Manager) that include app setup policies pinning role-relevant apps.
- **Tailored frontline app experience**: Auto-pins Shifts, Walkie Talkie, Tasks, and Approvals for users with F licenses; on by default.
- **App audit logging**: Teams app and first-party app activities (e.g., Shifts, Approvals events) are recorded in the Microsoft Purview audit log.
- **App governance for anonymous meeting users**: Anonymous participants inherit the global default app permission policy for in-meeting app use.

### Teams Toolkit / Microsoft 365 Agents Toolkit and Developer Portal

- **Microsoft 365 Agents Toolkit (evolution of Teams Toolkit)**: VS Code/Visual Studio/CLI toolkit with capability-focused scaffolding templates for tabs, bots, message extensions, Copilot agents, and common scenarios.
- **Automated provisioning**: Composable task framework auto-creates app IDs, bot registrations, Microsoft Entra app registrations, and infrastructure config.
- **Environments**: Named configuration sets (dev/test/prod) for testing against different hosted resource groupings.
- **Local debug with Dev Tunnels**: F5 run-and-debug of bots/agents with built-in dev tunnel support; tenant switching supported.
- **Declarative agent building**: Templates and features for Microsoft 365 Copilot declarative agents (including web search capability integration); agents run across Teams, Copilot, Office, and other channels.
- **Developer Portal for Teams**: Web portal (also available as a Teams app) to register apps, edit the app manifest, configure capabilities, manage environments and distribution, publish to the org catalog or the store, and analyze app usage; also hosts the Together Mode Scene Studio.
- **App manifest (Microsoft 365 app manifest)**: Versioned JSON schema declaring capabilities, domains, permissions (including RSC), and cross-M365 host support.
- **Sample gallery**: Extensive Microsoft Teams Samples repo with code samples for meeting stage, RSC, tabs, bots, and more.

### Microsoft Graph APIs for Teams

- **Teams/channel/membership management APIs**: Create teams (including from templates) and manage channels (standard/private/shared), members, tabs, and installed apps programmatically.
- **Messaging APIs**: Send and read channel and chat messages, replies, and hosted content; import historical messages via migration mode.
- **Export APIs**: Bulk export of 1:1, group chat, meeting chat, and channel messages including edited/deleted messages (deleted retrievable up to 21 days) and hosted content; up to 200 RPS per app per tenant / 600 RPS per app; a licensed/metered API for compliance and backup vendors.
- **Change notifications (webhooks)**: Real-time subscriptions to message created/updated/deleted events across chats/channels, membership changes, and more — suitable for rendering messages outside Teams without polling.
- **Online meeting APIs**: Create and manage online meetings, meeting attendance reports, meeting transcripts (OnlineMeetingTranscript.Read.All), and recordings access for scheduled private meetings.
- **Activity feed notification APIs**: Send activity feed notifications to users/teams/chats from an app with deep links; supports delegated, application, and RSC permission models (e.g., TeamsActivity.Send.User).
- **Shifts/schedule Graph APIs**: Schedule, shift, openShift, timeOff, swap-request, and time clock entities for workforce-management integration (used by UKG/Blue Yonder/Zebra-Reflexis connectors).
- **Teamwork device and policy APIs**: Additional Graph surfaces for Teams devices and admin scenarios.
- **RSC-scoped Graph access**: Chat/team-scoped data access (e.g., ChannelMessage.Read.Group) consented at the resource level rather than tenant-wide.

### First-Party Productivity Apps

- **Shifts**: Frontline schedule management — managers create and update shift schedules; employees view shifts, see who's on that day, request shift swaps, offer shifts, and request time off; mobile-first. Includes open shifts, shift groups, and day notes; guests not supported; requires a Teams license; available in GCC (not GCC High/DoD); data residency in APAC/EU/US plus AU/CA/FR/JP/UK local residency options.
- **Shifts connectors**: Managed connectors sync Shifts with workforce-management systems (UKG Pro WFM, Blue Yonder WFD) so schedules mastered in WFM appear in Teams.
- **Planner (formerly Tasks by Planner and To Do)**: Unified personal (To Do) plus team (Planner) task app in Teams — create/assign/track tasks, board and list views, and channel-tab plans; premium Planner capabilities (timeline, goals, portfolios) gated behind Planner/Project licenses.
- **Task publishing**: Ops leaders publish standardized task lists to selected frontline teams/locations and monitor completion centrally; supports per-member task lists, recurring published lists, required Forms input on completion, and required approval of completed work.
- **Lists**: Microsoft Lists app for channel tabs — create custom trackers from templates or Excel, with views, rules, and sharing, stored in the team's SharePoint site.
- **Approvals**: Personal-app hub to create, review, and act on approval requests from chat, channel, or the hub; backed by Power Automate/Dataverse (default environment). Features: approval templates (team-scoped and org-scoped, built on Microsoft Forms), file attachments, reassignment, sharing, viewer roles for chat/channel participants, e-signature integration with Adobe Sign and DocuSign (admin-toggleable per provider; provider license required), Purview audit events for every approval/e-sign/template action, Continuous Access Evaluation support, and limits of 400 templates per team and 50,000 requests per template. Requires a Power Automate/M365/Dynamics license; a Forms license is needed to author templates.
- **Praise**: Peer-recognition messaging extension for sending badges in chats and channels, with 14 badge titles (e.g., Courage, Optimism, Kind heart, Creative); enabled by default with an org-level admin toggle; custom badges manageable by admins.
- **Updates**: Check-in/report app for recurring or one-off status updates (e.g., store opening checklists, incident reports) using templates; submitters fill forms and reviewers track submissions — built on Forms infrastructure.
- **Bookings**: Appointment scheduling app in Teams — create Bookings calendars, add staff, define appointment types, and manage in-person and virtual visits.
- **Virtual Appointments app**: Schedule and manage B2C virtual appointments with a queue view of real-time statuses, SMS/email reminders, a browser-join lobby for external attendees, and analytics/reports; advanced queue/SMS/analytics features gated by Teams Premium (or frontline licensing).
- **OneNote**: OneNote notebooks as channel tabs and a personal app for shared team notes and meeting notes.
- **Stream**: Enterprise video (Stream on SharePoint) app/tab for browsing and embedding videos, recordings, and playlists inside Teams.
- **Forms / Polls**: Create surveys, quizzes, and live polls; the Polls app is the in-meeting/chat polling experience.
- **Whiteboard**: Collaborative digital canvas app usable in meetings, chats, and channel tabs.
- **Other Microsoft-provided store apps**: Admin, Azure AD Notifications, Azure Boards/Repos/Pipelines/DevOps (Server), Azure Lab Services, Bing News, Bulletins, Channel calendar, Copilot for Sales, Data Activator, Dataverse Chat Sync, Defender Experts, Dynamics 365, Employee ideas, Images, Inspection, Issue reporting, Mesh, Microsoft 365 Chat, Milestones, News, Project, Roadmap, PTZ Camera Controls, Queues App (Teams Premium call-queue management), SharePoint / SharePoint News / SharePoint Pages, Stocks, Topics, Visio, Weather, Website, Wikipedia Search, Outgoing Webhook.

### Viva Suite in Teams

- **Viva Connections**: Customizable company-branded home experience in Teams — personalized dashboard with role/region/interest-targeted cards, news feed, and resource navigation from SharePoint; basic features included in M365 F1/F3/E1/E3/E5. Partner dashboard-card integrations (ServiceNow, UKG, Qualtrics, Adobe Sign, etc.).
- **Viva Engage**: Community/social networking app in Teams (Yammer successor) — communities, storylines and stories, Q&A, leader Ask-Me-Anythings, announcements, campaigns; core features in M365; premium features (Communities & Communications / Employee Insights, leadership corner, advanced analytics) via Viva Suite or the Employee Communications add-on.
- **Viva Learning**: Learning hub in Teams aggregating LinkedIn Learning, Microsoft Learn, org content (SharePoint), LMS and third-party providers (SuccessFactors, Cornerstone, Udemy, Skillsoft, Go1, OpenSesame, etc.); share/recommend courses in chat and add learning tabs in channels; basic in M365, full connectors need a Viva Learning/Suite license.
- **Viva Insights**: Personal wellbeing/productivity insights app in Teams — protect time, stay connected, Headspace guided meditation, virtual commute, praise reminders; personal insights in E3+; manager/leader and advanced analytics (query designer) require Viva Insights premium/Suite.
- **Viva Goals**: OKR alignment app in Teams — create, align, and track objectives and key results, check-ins in the flow of work, dashboards; dozens of integrations (Azure DevOps, Jira, etc.); paid Viva Goals/Suite license.
- **Viva Pulse**: Manager-initiated quick feedback surveys using research-backed templates, with aggregated confidential reports; paid license (Viva Suite / Workplace Analytics & Feedback).
- **Viva Amplify**: Corporate-communications campaign tool — centralized campaign management, multi-channel publishing to Outlook, Teams, and SharePoint, approvals for drafts, and reach/engagement reporting; paid license.
- **Viva Glint**: Org-wide engagement survey ("voice of the employee") platform with benchmarks and recommended actions, surfaced alongside the Viva ecosystem; paid license.
- **Viva Topics (retired)**: AI knowledge topic cards inline in Teams/M365 content; product retired by Microsoft (was a paid add-on).
- **Copilot in Viva apps**: AI-assisted features per Viva module (e.g., Copilot in Viva Insights query building, Copilot in Engage post drafting), gated by Copilot/Viva licensing.

### Microsoft Places and Bookable Desks

- **Places app in Teams**: AI-powered hybrid-work app embedded in Teams/Outlook — set work location plans, see when teammates are in office, coordinate in-office days, and get space suggestions.
- **Bookable desks**: Reserve a desk in advance via the map-based Places finder, or auto-reserve by plugging a laptop into a desk peripheral (hotdesking detection) in the Teams desktop client.
- **Places finder and room booking**: Search and book rooms, desks, and work areas by floor map; Copilot can manage bookings (Copilot license).
- **Space analytics**: Occupancy and utilization reports for rooms/desks (requires a space license); auto-release of unused reservations is similarly gated.
- **Places licensing**: Premium Places features historically required Teams Premium; from April 2026 desk booking moves to per-space licensing via the Microsoft Teams Shared Space (MTSS) license (supports up to 4 desks per license plus a shared device).

### Communities (Teams Free / Consumer)

- **Communities in Microsoft Teams Free**: Group spaces outside org tenants for clubs, neighborhoods, and small businesses — discussions, file/photo sharing, video calls, and membership management with owner/member roles.
- **Community templates**: Create a community from templates (sports, volunteering, gaming, etc.) or from scratch.
- **Community calendar and events**: Owners schedule community events that appear in a shared calendar with attendee sign-up; events support Q&A-style gatherings.
- **Community channels**: Topic-based channels inside a community for organizing conversations.

### Licensing and Plan Notes

- **Copilot in Teams chat/channels**: Summarize long chats/threads, drafting/rewriting in compose, and cited Q&A over 30-day history require a Microsoft 365 Copilot add-on license.
- **Intelligent recap and advanced AI translation in meetings**: Teams Premium (or Copilot) — adjacent to chat but gated.
- **Shared channels with external orgs**: Requires Microsoft Entra B2B Direct Connect cross-tenant configuration on both tenants (no separate paid SKU, but admin setup required).
- **Sensitivity labels on teams**: Requires Microsoft Purview Information Protection licensing (e.g., M365 E3/E5 compliance plans).
- **Guest access**: Included with Microsoft 365; guests consume no Teams license (Entra B2B billing model applies for some premium guest features).
- **Custom emoji/reactions and messaging policies**: Edit/delete rights, urgent messages, read receipts, and chat permissions are admin-policy controlled under standard licensing.

## Part 2 · Meetings, Webinars & Events + Copilot/AI & Teams Premium + Audio Conferencing

### Scheduling & Calendar Integration

- **Teams calendar scheduling form** — Schedule meetings from the Teams Calendar with title, required/optional invitees, recurrence, channel selection, location, and agenda body; anyone invited can join via the link without a Teams account.
- **Outlook add-in** — Native Teams Meeting add-in in Outlook (Windows/Mac/web/mobile) adds a Teams join link and dial-in details to any Outlook meeting invitation; subject to admin authentication policy.
- **Teams meeting add-on for Google Workspace** — Official add-on lets users with a Microsoft work/school account schedule and join Teams meetings directly from Google Calendar ("Add conferencing > Teams meeting"). Limitations: meeting/AI notes, passcode generation, and Copilot are not supported for meetings scheduled this way.
- **Scheduling assistant** — Free/busy view of invitees' calendars inside the scheduling form to pick a conflict-free time.
- **Meeting options page** — Per-meeting organizer settings (lobby bypass, who can present, attendee mic/camera, recording, Q&A, reactions, etc.) editable before and during the meeting.
- **Custom meeting templates (Teams Premium)** — Admins/IT build templates that pre-set and optionally lock meeting options (sensitivity, lobby, recording, watermark, E2EE) to enforce compliance and consistency; personal meeting templates are a Premium user feature, and a built-in virtual appointment template is standard.
- **Registration on events** — Events (webinars/town halls) support registration pages; plain meetings do not.
- **Manage who can schedule** — Admin policies control which users can start instant meetings, schedule meetings, or create events (webinar and town hall policies applied separately).

### Meet Now & Channel Meetings

- **Meet Now (instant meetings)** — Start an ad-hoc meeting instantly from Calendar, a chat, or a channel; chat, recording, files, and notes remain accessible to participants afterward.
- **Channel meetings** — Meetings scheduled in a channel are visible to the whole team; any team member can see it, join, and use the meeting chat which is posted in the channel thread. Attendance reports are not supported for instant channel meetings.
- **Meeting chat continuity** — Every meeting has a persistent chat thread that lives on before/after the meeting; admins can manage/moderate meeting chat.

### Join, Lobby & Roles

- **Lobby with bypass rules** — "Who can bypass the lobby?" options (everyone, people in my org, trusted orgs, invited only, only organizer, etc.); organizers admit/deny waiting participants.
- **Anonymous join** — Participants without Teams accounts join from the invite link or dial in by phone (audio conferencing).
- **Anonymous join with email verification (Teams Premium)** — Require unverified/anonymous participants to verify via an email one-time code before joining the meeting.
- **Join verification check** — Verification step for meeting joins; a separate join verification flow exists for external presenters in events.
- **Roles: organizer / co-organizer / presenter / attendee** — Up to 10 co-organizers who share most organizer controls; presenter role grantable to specific people (up to 100 presenters in events); a "limit presenter role permissions" policy reduces what presenters can do.
- **Entry/exit announcements** — Announce when phone callers join or leave.
- **Participant renaming** — Organizers can allow participants to rename themselves in meetings and events up to 1,000 attendees.
- **View-only overflow attendees** — Meetings scale to 11,000 total: 1,000 fully interactive (Enterprise plans; 300 on Business plans) plus 10,000 view-only attendees who watch without interacting.
- **End meeting for everyone** — Organizer control that ends the session for all participants at once.
- **Prevent joining external meetings** — Admin policy blocks users from joining meetings hosted outside the org.
- **Teams Rooms / CVI join** — Teams Rooms (Windows/Android) can join meetings and events as attendee or presenter; Cloud Video Interop lets third-party SIP/H.323 room systems join as presenters.

### Audio/Video Controls & Hard Mute

- **Mute controls** — Self mute/unmute, "Mute all", and per-participant mute from the participant pane.
- **Hard mute ("Don't allow attendees to unmute")** — Disable attendee mics so they cannot unmute themselves; individual attendees can be granted permission (raise hand → allow mic).
- **Disable attendee cameras** — Parallel "Disable camera for attendees" toggle, per-meeting or per-participant, so attendees cannot start video.
- **Attendee mic/camera policy in events** — Available in events up to 1,000 attendees; off and locked for larger events.
- **Voice isolation** — AI voice-print-based filtering that isolates the enrolled user's voice from background voices/noise in calls and meetings, and correctly attributes the speaker in transcripts. Standard (no add-on license).
- **AI noise suppression** — Background-noise reduction in meetings/calls using the same AI pipeline. Standard.
- **Spatial audio** — Positional audio in meetings so voices come from the direction of the speaker's tile.
- **1080p video** — Full HD video resolution supported in meetings and large events (event-side up to 20,000 attendees).
- **Video optimization / IntelliFrame facial recognition** — AI auto-brightness, framing, and Recognition profiles so in-room participants are individually identified in video and transcripts; Recognition profiles tie to Teams Rooms. Standard.

### Backgrounds, Appearance & Branding (Teams Premium personalization)

- **Background blur and background images** — Standard blur plus stock/custom personal background images applied before or during the meeting.
- **Custom organization meeting backgrounds (Teams Premium)** — Admins upload company-approved branded background images that licensed users can apply.
- **Decorate my background (Teams Premium)** — Generative AI creates a cleaned-up/decorated version of the user's real room as a background (also available in GCC).
- **Video effects/filters** — Soft focus, brightness adjustment, and fun facial filter effects.
- **Custom meeting themes / branded meetings (Teams Premium)** — Organization logo, brand colors, and imagery applied to the meeting invite, pre-join screen, lobby, and in-meeting visuals, plus branded meeting reactions; admin-configured, organizer-level effect benefiting all attendees.
- **Custom Bookings lobby branding (Teams Premium)** — Branding of the Bookings/virtual appointment waiting room; admin-configured.

### Layouts & Views

- **Gallery view** — Default grid; adjustable (e.g., prioritize video, hide own tile, 16:9 tiles, gallery size options).
- **Large gallery** — Up to 49 videos at once (7x7) when 10+ cameras are on, with pagination controls beyond 49.
- **Together mode** — Segments participants' video into a shared virtual scene (auditorium etc.); available with 5+ participants; scene selection by organizer/presenters.
- **Front row (Teams Rooms)** — Room-display layout placing remote participants at eye level with chat/raised-hands/captions panels alongside.
- **Focus/content view, pin own video, hide me** — View customizations including focusing on shared content and hiding/repositioning your own tile.
- **Dual-monitor/pop-out** — Pop out shared content or chat into separate windows.

### Screen & Content Sharing

- **Screen/window sharing** — Share entire desktop, a single window, or (on mobile) the phone screen; include system/computer audio toggle for media sound.
- **Give/request control** — Participants and external participants can give or request control of shared content (policy-controlled; not in large-audience events).
- **Presenter modes** — Standout (presenter overlaid on content), Side-by-side, and Reporter modes when sharing.
- **PowerPoint Live** — Present a deck natively: presenter sees notes/grid/thumbnails and a laser pointer/inking, attendees can privately navigate slides ahead (unless locked), with high-fidelity slides and accessibility (screen reader, translate slides).
- **PowerPoint Cameo** — Embed the presenter's live camera feed inside slides presented through PowerPoint Live.
- **Excel Live** — Share an Excel workbook so every participant can edit and explore it together directly in the meeting window; supported in meetings with 25 or fewer invitees.
- **Microsoft Whiteboard** — Shared infinite canvas in meetings for co-drawing, sticky notes, templates; content persists after the meeting; policy-controlled (not available in large-audience events).
- **Annotation (screen-share markup)** — Whiteboard-powered annotation layer over a shared full screen; presenter can allow everyone or only themselves to annotate with pens, shapes, text, sticky notes.
- **Content from camera** — Share a physical whiteboard or document via a second camera with image enhancement.
- **NDI output** — Broadcast individual participant audio/video streams over the local network for professional production tools.
- **Live share apps (Teams apps in meetings)** — Third-party/first-party meeting apps can be added to the meeting stage for co-interaction.

### Breakout Rooms

- **Breakout rooms** — Organizer/co-organizer creates up to 50 sub-rooms; automatic or manual participant assignment; participants can be moved between rooms.
- **Room timer and auto-close** — Set time limits with visible countdown; rooms close automatically and participants return to the main meeting.
- **Announcements to rooms** — Broadcast messages from the organizer into every breakout room.
- **Breakout room managers** — Presenters can be appointed to manage rooms on behalf of the organizer.
- **Room retention** — Room chats/files remain accessible; rooms can be reused across sessions of a recurring meeting.
- **Event limitation** — Breakout rooms work in events only under 300 attendees; unavailable in large-audience events.

### Engagement: Hand Raise, Reactions, Polls, Q&A

- **Raise hand** — Queue-ordered hand raise for attendees; supported in events up to 20,000 attendees.
- **Live reactions** — Emoji reactions (like, love, applause, laugh, surprise) float over the meeting; organizer can disable; supported in events up to 20,000 attendees.
- **Polls** — Forms-based polls (multiple choice, quiz, word cloud, rating, ranking) created before or during meetings; launchable live with real-time results; in events up to 20,000 attendees.
- **Q&A** — Structured question feed for large meetings/events: attendee questions with replies and upvoting, optional anonymous posting, a moderation queue (review/approve/dismiss/publish), and pinned answers; scales to 100,000 attendees in town halls.
- **Event group chat / comment stream** — Large-audience events use a comment-stream style chat (up to 20,000 attendees) plus a separate event group chat for the production team.

### Captions, Translation & Transcription

- **Live captions** — Real-time speech-to-text captions with speaker attribution; caption spoken language selectable.
- **Live translated captions (Teams Premium or Copilot license)** — Captions translated in real time into the viewer's chosen language (40+ languages); an organizer with Teams Premium unlocks translated captions for all attendees in that meeting; organizers can pre-select 6 languages (10 with Premium).
- **Live transcription** — Running side-panel transcript with speaker names, saved after the meeting and downloadable.
- **Live translated transcription (Teams Premium)** — The running meeting/event transcript is translated during and after the meeting into each user's chosen language.
- **CART captions** — Support for human-generated (CART) caption streams injected into meetings. Standard.
- **Real-Time Text (RTT)** — Character-by-character typed text transmission for accessibility in meetings. Standard.
- **Language interpretation (human)** — Organizer assigns human interpreters; attendees pick a language channel and hear the interpreter over the original audio. Standard.
- **Interpreter agent (Teams Premium or Copilot)** — AI-based real-time speech-to-speech interpretation in meetings.
- **Multilingual meeting support (Teams Premium)** — Recap/transcript intelligence across multiple spoken languages.
- **Custom dictionaries for transcription (Copilot)** — Admins upload a custom dictionary in the Microsoft 365 admin center to improve transcription quality (product names, jargon) for meetings and events.

### Recording

- **Convenience recording** — One-click cloud recording (video + audio + shared content) saved to OneDrive/SharePoint with automatic permissions for attendees; org-internal playback with speed controls and indexed transcript.
- **Auto-recording** — Organizers/admins can set meetings to record automatically at start.
- **Recording expiration policy** — Admin-set auto-expiry deletes recordings after a defined period.
- **Compliance recording** — Policy-based recording via certified third-party recorders for regulated users.
- **Who can record and transcribe (Teams Premium)** — Organizer-level control restricting which participants/roles may start recording or transcription.
- **Recording limits** — Max ~4 hours or 1.5 GB per file, then recording auto-restarts; meetings can run up to 30 hours.
- **VOD publishing (events)** — Town halls/webinars can publish recordings as on-demand video for attendees post-event.

### Copilot in Teams Meetings & Events (Microsoft 365 Copilot license)

- **Real-time meeting summarization** — During a live meeting, Copilot summarizes key discussion points including who said what and where participants agree/disagree; the organizer's Copilot setting controls availability for the meeting.
- **Ask-anything during a meeting (open prompt box)** — Attendees ask Copilot arbitrary questions mid-meeting ("Where do we disagree?", "Summarize what [person] said", "Create a table of ideas with pros and cons") via a Copilot side pane that can be popped into a separate window on desktop.
- **Suggested prompts gallery** — A "View prompts" menu offers pre-built prompts (recap so far, list action items, list unresolved questions, different perspectives) so users don't have to compose queries.
- **Action item generation** — Copilot captures action items from natural conversation even when nobody explicitly labels them, during and after the meeting.
- **Late-joiner catch-up notification** — If a user joins more than 5 minutes after start and Copilot is active, Copilot proactively offers a summary of what was missed.
- **Copilot without retained transcript ("Only during the meeting" mode)** — Organizers can run Copilot on live speech-to-text without retaining a transcript afterward; the alternative "During and after" mode requires transcription on; admin policy can allow/deny each mode.
- **Post-meeting Copilot Q&A** — After the meeting, users prompt Copilot from the meeting chat and Recap tab; responses combine transcript and meeting-chat content with citations (transcription must have been on).
- **Export of long Copilot responses** — Responses over ~1,300 characters export to Word; tabular output exports to Excel (subject to sensitivity labels).
- **Copilot in events (webinars/town halls)** — In large-audience events Copilot is available to organizers, co-organizers, and presenters only (not attendees).
- **Copilot in Teams Rooms** — Copilot answers open-ended questions, recaps in-room discussion, and provides meeting insights on Teams Rooms devices (room on Teams Rooms Pro).
- **Copilot for B2B members in multitenant orgs** — Licensed B2B members can use Copilot in Teams across a multitenant organization.

### Copilot in Teams Chat & Channels

- **Chat/channel catch-up and summarization (Copilot license)** — Copilot summarizes long chat threads and channel conversations, extracts decisions and open questions, and answers questions about the conversation history.
- **Intelligent message rewriting/compose help (Copilot license)** — Copilot assists composing messages with rewrite, tone adjustment, and suggestions in the compose box.
- **Microsoft Copilot Chat app (no add-on license)** — A free Copilot chat app in Teams for open-ended questions, content creation, and Copilot Pages; grounded only in public web data without a Copilot license; included with M365 + Teams license.
- **Microsoft 365 Copilot app (work-grounded, Copilot license)** — With a Copilot license the app is additionally grounded in the user's work data (mail, files, meetings), with a toggle between work and web grounding.
- **Suggested replies in chat** — AI-suggested short responses in 1:1 and group chats. Standard.

### Copilot in Teams Phone / Calls

- **Intelligent call recap for VoIP and PSTN calls** — AI-generated notes and recommended tasks for 1:1/group VoIP calls and PSTN calls via a "Recap" button in the Calls app or the call's chat; VoIP recaps also include speakers, topics, mentions, and chapters. Teams Premium or Copilot license; PSTN additionally requires Teams Phone license + calling plan and transcription enabled.
- **During-call Copilot prompts (Copilot license)** — Invoke Copilot live during a phone call to list action items, suggest follow-up questions, or answer ad-hoc questions about the conversation.
- **Post-call summary view (Copilot license)** — Hover over a transcribed/recorded call in Calls history and select "View summary" for transcript, AI notes, and follow-up tasks; prompts like "What was the mood of the call?" are supported.
- **Call-transfer AI briefing (Copilot license)** — When a transcribed/recorded call is transferred or forwarded, Copilot auto-generates AI notes as a briefing for the receiving colleague.
- **Copilot call delegation (Copilot license)** — Copilot-assisted handling of delegated calls in Teams.
- **Copilot on Teams phone devices (Copilot license)** — Copilot capabilities are manageable on physical Teams phones.

### AI Agents in Teams

- **Facilitator agent (Copilot license)** — A collaboration agent that takes live AI notes during meetings and in chats, keeping agenda/notes moving like another team member; also works in Teams Rooms for unscheduled in-person meetings.
- **Channel Agent (Copilot license)** — A channel-resident agent that flags deadlines buried in conversations, produces status reports, assigns tasks and due dates, answers natural-language questions, schedules channel meetings, creates project tasks, and drafts/sends emails; summaries can be approved/rejected; Purview data-security controls available.
- **Interpreter agent (Teams Premium or Copilot)** — Real-time AI speech-to-speech interpretation in meetings.

### Intelligent Meeting Recap (Teams Premium or Microsoft 365 Copilot)

- **AI meeting notes and recommended tasks** — Auto-generated notes and follow-up tasks in the Recap tab of the Teams calendar and chat after meetings/events; also works for instant meetings and VoIP/PSTN calls (Premium).
- **Recap for transcript-only meetings (no recording)** — Full recap notes/tasks generated from transcript alone when recording is off (without recording, the recap lacks speakers/topics/chapters video navigation).
- **Speaker timeline markers** — Shows who spoke and when, with jump-to-that-moment navigation in the recording and intelligent speaker search in the transcript.
- **Personalized timeline markers** — Markers for when the user's name was mentioned in the spoken transcript, when screens were shared, and when the user joined or left the meeting.
- **AI-generated topic chapters** — The recording is auto-divided into chapters/topics so users can jump to when a subject was discussed; PowerPoint Live sharing also generates PPT-based chapters.
- **Recap of missed meetings and instant ("Meet now") meetings (Teams Premium)** — Users can view and recap meetings they didn't attend and unscheduled instant meetings.
- **Multilingual meeting recap** — Recap translated into each participant's chosen live-translated-transcription language (EN/ES/JA/FR/DE/PT/IT/zh-Hans/KO); in public preview.
- **Share recap externally via Outlook** — From the Recap tab, users can share the meeting recap with specified external attendees through Outlook.
- **Audio recap (podcast-style)** — AI-narrated audio summary combining up to eight meetings into one episode, playable on desktop and mobile; stored 60 days in OneDrive. Requires a Microsoft 365 Copilot license specifically (Teams Premium is not sufficient); public preview.
- **Video recap (Copilot license)** — Narrated highlight reel stitching AI summaries with short clips from the recording (up to 100 highlights per recording); requires the meeting to be recorded and at least 10 minutes long.
- **Intelligent recap for events** — Recap is available for town halls/webinars, but only to organizers, co-organizers, and presenters.
- **Custom summary templates (Copilot license)** — Customizable meeting summary templates for recaps.

### Speaker Coach & Meeting Preparation

- **Speaker Coach** — Private, real-time AI speaking feedback in meetings (pace, filler words, pitch, repetitive language, inclusiveness) with a private post-meeting timestamped report visible only to the speaker; in events limited to organizers/co-organizers/presenters. Standard.
- **View and prepare for upcoming meetings / meetings filter** — The Meet app surfaces upcoming meetings, files, recaps, and filters (All / with Content / Recorded). Standard.
- **Intelligent media quality classifiers in CQD** — ML-based classifiers in the Call Quality Dashboard giving root-cause analysis of media degradation. Standard (admin-facing).

### Spotlight, Pin & Stage Management

- **Spotlight** — Organizer/presenter spotlights up to 7 video feeds as the main view for everyone.
- **Pin** — Any participant privately pins one or more videos for their own view.
- **Manage what attendees see (events/webinars)** — Organizer curates the attendee stage: only spotlighted/brought-on-screen presenters' video and content are visible, other camera streams stay hidden; includes "bring on screen / remove from screen" control.
- **Hide attendee names** — Organizer hides attendee identities from other attendees in meetings and webinars (admin-enabled; listed among Premium admin-config features).

### Attendance & Engagement Reports

- **Attendance report** — During and after meetings/events: who joined, join/leave times, duration, role; downloadable CSV; organizer toggle to include/exclude; attendees can opt out via policy.
- **Engagement report (events)** — Total reactions, raised hands, cameras on, and other engagement data in the Attendance tab after meetings and events.
- **Registration/attendance funnel for webinars** — Registered vs. attended and cancellation data for event follow-up.

### Collaborative Meeting Notes (Loop)

- **Collaborative notes** — Loop-component meeting notes with co-editable agenda, notes, and follow-up tasks; editable before, during, and after the meeting from Teams, the Outlook invite, or Office.com; assigned tasks sync to Planner/To Do.
- **Collaborative notes in chats** — The same Loop-based notes are usable from Teams chats.

### Meeting Protection & Privacy (largely Teams Premium)

- **Green room** — Organizers/presenters join a backstage area to prepare (check AV, review content, monitor chat/Q&A) while attendees wait on a welcome screen; available for meetings and events.
- **Watermarking (Teams Premium)** — Dynamic watermark of each viewer's email overlaid on shared content and/or attendee video to deter leaks; disables recording where incompatible; unavailable in town halls.
- **End-to-end encryption (E2EE) for meetings (Teams Premium)** — Optional E2EE for scheduled online meetings up to 200 participants (already standard for 1:1 calls); disables some features like recording/captions; admin must enable.
- **Sensitivity labels for meetings (Teams Premium + M365 E5/E5 Compliance/F5 Compliance or F5 Sec+Comp)** — Purview sensitivity labels applied to meetings automatically enforce meeting protection option sets (lobby, watermark, E2EE, chat restrictions); labels can auto-escalate based on the sensitivity of files shared in the meeting.
- **Prevent copying/forwarding of chat, captions, transcripts (Teams Premium)** — Organizer can disable copy/paste and forwarding of meeting chat messages, live captions, transcript, and recap content; admin-enabled.
- **Detect sensitive content during screen sharing (Teams Premium)** — AI detects sensitive info (e.g., credentials, PII) being screen-shared and can warn/act.
- **Prevent screen capture (Teams Premium)** — Blocks OS screenshots/screen capture of the meeting window on supported clients.
- **Block content sharing in external meetings (Teams Premium)** — Prevents your users from sharing screens/content when attending Teams meetings hosted by other organizations.
- **Require unverified participants to verify before joining (Teams Premium)** — Anonymous users must verify via email code before entering the meeting.
- **Screen-share markers in transcript (Teams Premium)** — The transcript records when a screen was shared during the meeting.
- **Chat moderation and safety** — Organizer moderation of meeting chat; **block incoming chats from people in the organization** is a Premium user-level control for focus/protection scenarios.
- **Priority account chat controls (Teams Premium)** — Special chat controls for priority accounts (executives); admin configuration.
- **Custom user policy packages (Teams Premium)** — Admins build custom bundles of Teams policies and assign them as packages.

### Production & Streaming

- **RTMP-In** — Produce a meeting/webinar/town hall from an external hardware/software encoder feed injected into the event.
- **RTMP-Out (live streaming)** — Stream a Teams meeting/event out to any RTMP endpoint (YouTube, LinkedIn Live, etc.). Standard.
- **Streaming encoders and NDI** — Encoder-based production and NDI output supported for meetings and large events for professional AV workflows.
- **eCDN (Microsoft eCDN or partners)** — Peer-assisted enterprise content delivery keeps large-event video from saturating corporate networks; Microsoft eCDN is first-party (included with Teams Premium, now also Teams Enterprise per April 2026 changes) and third-party eCDN providers are supported.
- **eCDN analytics / real-time attendee monitoring** — Dashboard for live troubleshooting of stream health and attendee experience during events.
- **Ultra-Low Latency (ULL) streaming** — Significantly reduced glass-to-glass latency for large events (up to 20,000 attendees) so attendees stay in sync with presenters.
- **Silent Test / Silent Testing** — Admins simulate large-scale broadcast load (and per-meeting silent test calls, a Premium meetings-level feature) to validate network and broadcast capacity before real events.
- **Teams event insights** — Live monitoring of attendee join counts and audio/video quality for organizers during an event.
- **Production tools control ("Who has control", town halls)** — Organizer designates who operates town hall production tools (manage stage/scene control, bringing presenters/content on screen).
- **Best practice configurations dashboard** — Admin dashboard checking meeting-quality best-practice settings. Standard.
- **QoS support** — DSCP-tagged media traffic for network prioritization.
- **Real-time telemetry** — Live per-participant quality telemetry for troubleshooting: 24-hour retention standard, automatic extended 7-day retention with Teams Premium.
- **Audio/video/screen-sharing quality alerts (Teams Premium)** — Proactive alerts to admins when a user's meeting audio, video, or screen-share quality degrades.

### Webinars (events up to 1,000 attendees)

- **Registration page & form** — Custom-branded registration site with speaker bios, session details, custom questions, and a capacity limit setting.
- **Registration window** — Organizers set start/end times during which registration is open. (Historically Teams Premium; moved into Teams Enterprise per the April 1, 2026 licensing change.)
- **Manual registration approval** — Organizer reviews and approves or denies each registration request. (Same licensing note.)
- **Waitlist** — When capacity is reached, further registrants go to a waitlist and auto-promote to pending/approved as spots open. (Same licensing note.)
- **Reminder emails with custom send times** — Automatic reminder email 1 hour before start; organizers can change the send time.
- **Custom email templates** — Organizer/co-organizer customization of confirmation/reminder/cancellation emails sent to registrants.
- **Presenter management** — External presenters get unique join links with join verification; up to 100 presenters.
- **Green room, manage what attendees see, hide attendee names** — All available for webinars (see Protection and Stage Management sections).
- **Attendee mic/camera control** — Interactivity allowed up to 1,000 attendees.
- **Webinar analytics** — Registration plus attendance/engagement reporting, viewable and downloadable.
- **Breakout rooms in small events** — Supported in events under 300 attendees.

### Town Halls & Events Optimized for Large Audiences (successor to Live Events)

- **Town hall event type** — Broadcast-style one-to-many event replacing Teams Live Events (retired September 30, 2024); production happens in the Teams client rather than the old producer UI.
- **Capacity tiers** — Teams Enterprise: interactive-engagement events up to 3,000 attendees and view-only (with Q&A) up to 10,000; the **Attendee Capacity Pack** add-on scales to 100,000; Teams Events Services (white-glove) recommended above 20,000. Teams Premium purchased before April 1, 2026: up to 20,000 attendees (grandfathered to 100k until term end) and up to 50 concurrent events per tenant (vs 15).
- **Q&A at scale** — Moderated Q&A up to 100,000 attendees.
- **Chat, reactions, raise hand, polls at scale** — Comment-stream chat, reactions, raise hand, and polls for events up to 20,000 attendees.
- **Registration at scale** — Up to 20,000 attendees.
- **Custom event emails** — Editable invite/reminder attendee email templates for town halls.
- **External presenter join verification** — Verification flow for external presenters joining events.
- **Events app** — Central hub to create, discover, and manage events; unified creation flow chooses capabilities by capacity instead of fixed event types; webinar/town-hall admin policies still apply underneath.
- **Large-event production stack** — VOD publishing, attendance/engagement reports, eCDN, ULL, 1080p, silent test, event insights, and encoder/RTMP production all available for large events (see Production & Streaming).
- **Concurrent events** — Multiple simultaneous events supported per tenant (tenant event limits apply).

### Virtual Appointments (Bookings-based B2C meetings)

- **Virtual Appointments app** — Central Teams app for scheduling and managing business-to-customer appointments (healthcare visits, consultations, interviews), connected to Bookings calendars. Note: the standalone Virtual Appointments app has been retired; Microsoft Bookings (+ Teams Premium for advanced capabilities) is the successor.
- **Bookings core scheduling** — Booking pages, staff availability management, staff assignment and notification, email confirmations/reminders/follow-ups. Standard with M365.
- **Browser join for external attendees** — Customers join appointments from a mobile or desktop browser with no Teams app or account. Standard.
- **Custom lobby/waiting room** — Branded lobby where attendees wait with wait times tracked (branding customization is a Premium capability).
- **Virtual appointment meeting template** — Default Teams meeting template purpose-built for B2C appointments with external guests. Standard.
- **SMS text notifications (Teams Premium)** — Appointment confirmation/reminder texts with join links sent to external attendees (available in US, UK, CA, AU, NL).
- **Queue view (Teams Premium)** — Real-time queue of scheduled and on-demand appointments with color-coded statuses, wait times, lobby presence, and pre-/post-appointment actions, usable by schedulers/supervisors/admins.
- **On-demand (walk-in) appointments (Teams Premium)** — Support for unscheduled appointments managed through the queue.
- **Appointment analytics (Teams Premium for org-level)** — Usage reports: appointment counts, duration, lobby wait time, no-shows; department/org rollups in the Teams admin center.
- **Virtual Appointments Graph API** — Programmatically create appointment join links (with waiting room + browser join) and embed them into existing scheduling systems (EHR etc.). Standard/developer.
- **Teams EHR connector** — Launch virtual patient visits directly from Oracle Health or Epic EHR systems (separate Microsoft Cloud for Healthcare/EHR connector subscription).

### Mesh Avatars & Immersive Experiences

- **Avatars for Teams** — Customizable 3D avatars that represent users camera-off in standard 2D meetings, with avatar reactions/gestures; included in standard Teams licensing.
- **Immersive events in Teams (successor to Mesh immersive spaces)** — On December 1, 2025 Microsoft retired the meeting "Immersive space (3D)" view and Mesh on web, replaced by immersive events: hosted 3D events for up to 300 attendees on PC, Mac, and Meta Quest VR; requires a Teams Enterprise license to host.
- **Customizable 3D environments** — No-code customization of prebuilt environments with brand assets, images, videos, screens, and 3D objects; templates for onboarding, training, showcases, socials.
- **Spatial audio in 3D** — Location-based audio enabling multiple simultaneous conversations that get louder/softer with avatar proximity.
- **In-space interaction** — Avatar reactions, selfies in 3D space, built-in team-bonding games, Teams chat integration.
- **Enterprise security/MDM** — Integrated with Microsoft 365 security/compliance; managed Quest devices enrollable via Intune/MDM through Meta Horizon Managed Services.

### Teams Premium — Advanced Collaboration Analytics & Management (admin)

- **Advanced collaboration analytics** — Admin insights on inactive teams, inactive external domains, and external collaboration by guest/team/user (requires Premium licenses tenant-wide for this use).
- **Teams Premium usage reporting** — Counts of meetings that used a Premium feature and per-user counts of Premium-feature meetings attended.
- **Teams Premium management dashboard** — Central place to manage Premium licenses/features (requires at least one active Premium license in the tenant).

### Teams Premium — Queues App (advanced call queue management; requires Teams Phone license)

- **In-Teams call queue and auto attendant management** — Authorized users configure queues and auto attendants directly inside Teams without admin center access.
- **Real-time queue metrics** — Live dashboards of call volume, wait times, and agent status for call queues and auto attendants.
- **Historical reporting** — Trend reporting for call queues and auto attendants inside the Queues app.
- **Monitor/whisper/barge/takeover** — Authorized supervisors can silently monitor agent calls, whisper private coaching to the agent, or barge into/take over live calls.

### Audio Conferencing — Dial-in Join (PSTN attendee experience)

- **Automatic invite insertion of dial-in coordinates** — When an organizer holds an Audio Conferencing license, the dial-in phone number(s) and a conference ID are automatically appended to meeting invites scheduled in Outlook, Outlook on the web, or Teams; no extra organizer action needed.
- **Unique per-meeting conference ID** — Each scheduled meeting gets its own randomly assigned conference ID that callers key in after dialing the bridge; users cannot reserve a static/personal conference ID or reset it themselves (an admin can reset a user's conference ID).
- **"Find a local number" link** — Every Audio Conferencing invite carries a link opening the full list of all dial-in numbers across all countries/regions on the tenant's bridge; callers may use any bridge number, not just the one on the invite.
- **Default number selection per organizer** — The organizer's default toll (and optionally toll-free) number appears on the invite; for new users the default toll number is auto-picked to match their Usage Location, falling back to the bridge's default number.
- **Anyone with the coordinates can join** — Any caller with the dial-in number and conference ID can join by phone (subject to lobby settings and meeting lock); dial-in attendees need no license, no Teams account, and no setup.
- **Attendee phone-join scenarios** — Documented use cases: limited internet connectivity, audio-only meetings, failed Teams app join, better PSTN call quality, hands-free join over Bluetooth, general convenience.
- **Phone-only content limitation** — Dial-in participants get audio only; they can't see shared content unless they also join on a second device.

### Audio Conferencing — DTMF Dial-Pad Commands

- **\*1 command menu** — Plays descriptions of all available dial-pad commands.
- **\*3 hear participant names** — Reads out the names of people on the call.
- **\*5 raise/lower hand** — Phone participants can raise or lower their hand.
- **\*6 mute/unmute** — Self mute/unmute from the phone keypad.
- **\*7 lock/unlock conference** — Lock or unlock the meeting from the phone.
- **\*9 toggle join/leave announcements** — Turn entry/exit announcements on or off.
- **Organizer-only commands \*21 / \*22 / \*23 / \*24** — Admit all lobby participants (\*21), mute all participants except organizer (\*22), toggle enter/exit announcements (\*23), hear the count of participants waiting in the lobby (\*24).
- **No operator assistance** — Pressing \*0 does not connect to any operator/support; there is no operator-assisted conferencing.

### Audio Conferencing — Organizer PIN & Starting Meetings by Phone

- **Audio Conferencing PIN per organizer** — Every Audio Conferencing user gets a numeric PIN used to authenticate as organizer and start a meeting from a phone when no Teams-app user has started it; if the meeting is already started from the Teams app, no PIN is asked.
- **Phone-only meeting start flow** — When organizer and all participants dial in, the organizer enters their PIN to start; dial-in participants arriving early wait in the lobby with music on hold, then are admitted per the lobby policy (organizer can bulk-admit with \*21).
- **"Allow unauthenticated callers to be the first people in a meeting"** — Per-user setting (off by default): the organizer's meetings start as soon as the first dial-in caller joins, with no PIN and no lobby for that first caller ("anonymous start").
- **Configurable PIN length** — Admins set PIN length between 4 and 12 digits (default 5) in bridge settings; a changed length applies only to newly generated PINs.
- **Admin PIN reset + self-service PIN reset** — Admins reset PINs from Teams admin center (Users > user > Audio Conferencing > Reset PIN); users self-reset at dialin.teams.microsoft.com/usp (GCC High: dialin.cpc.gov.teams.microsoft.us/usp; DoD: dialin.cpc.dod.teams.microsoft.us/usp — self-service reset sends no email).
- **PIN secrecy handling** — The PIN is shown to the admin only once at reset, then masked; new PINs are emailed to the user's primary SMTP address (an alternate non-M365 address can be set via PowerShell for users without an Exchange mailbox).
- **Automatic settings emails (toggleable)** — Users automatically receive emails with their conferencing info at enablement, settings change, or PIN reset; admins can disable the automatic emails and instead send a "conference info" email manually per user (that manual email excludes the PIN).
- **Meeting duration rules tied to phone join** — A meeting where someone entered via PIN ends after 30 hours; if all participants are dial-in and no PIN was used: it ends after 4 hours when anonymous start is allowed, or 90 minutes after the last authenticated participant leaves when it isn't.

### Audio Conferencing — "Call Me" Call-Back & Dial-Out

- **"Call me" call-back** — On the pre-join audio options screen, a participant picks Phone audio, enters their number, and the meeting service calls them, connecting the phone as meeting audio (answer and press 1/say "Ok") while screen content stays on the computer.
- **"Dial in manually" alternative** — The Phone audio join screen also offers the full list of dial-in numbers for manual dialing.
- **Automatic "Call me back" on audio failure** — Teams detects in-meeting audio/device problems (e.g., no microphone found) and proactively surfaces a "Call me back" button that opens the use-phone-for-audio screen mid-meeting.
- **Licensing/policy gate for Call me** — Requires the organizer to have Audio Conferencing enabled AND dial-out from meetings enabled; if the organizer lacks dial-out permission, the Phone audio option is hidden for every participant in that meeting; call-backs consume the same dial-out minute pool / Communications Credits as other dial-out calls.
- **Participants calling out to others** — Participants with dial-out enabled can, once in the meeting, call another person's number from the Show participants pane to pull them in.
- **In-meeting dial-out ("invite by phone")** — From the meeting's People / Add people control, an E.164-format number can be dialed; the called phone rings and joins the meeting audio; available only when joining from the Teams app.
- **Dial-out eligibility** — The organizer must have Audio Conferencing enabled, or use Calling Plans or Direct Routing for PSTN calls, and be granted an online dial-out policy permitting conferencing dial-out (Grant-CsDialoutPolicy).
- **International dial-out** — Attendees can dial out internationally to invite callers, billed per Zone A/minute-pool/Communications Credits rules; dial-out is only available to some countries/regions.
- **Rate basis** — Per-minute-billed dial-out calls are rated by the destination of the call, not by the organizer's or initiator's country.

### Audio Conferencing — Bridge Numbers, Toll vs Toll-Free & Bridge Settings

- **Audio conferencing bridge with auto attendant** — Enabling Audio Conferencing provisions a conference bridge that answers PSTN callers with voice prompts (language prompts, optional name recording, notifications) before placing them in the meeting.
- **Toll (shared) numbers auto-assigned** — Shared toll numbers are automatically assigned to the tenant, with a default bridge number drawn from the organization's country/region (exceptions: Venezuela, Indonesia, UAE receive no auto toll number due to inventory).
- **Toll-free numbers (optional, limited countries)** — Invitees pay nothing when calling toll-free bridge numbers; availability is country-limited, and toll-free usage requires Communications Credits and is billed per minute to the tenant.
- **Dedicated vs shared numbers** — Dedicated service numbers are exclusive to the tenant and support changing the auto attendant languages (one primary + up to three secondary per number); shared numbers are used across Microsoft 365 tenants and their languages can't be changed.
- **Acquiring dedicated numbers** — Via Teams admin center (country-dependent), by porting/transferring existing numbers from a carrier, or via a phone-number request form; specific-city/area-code requests go through a "phone number support" ticket.
- **Conference bridge management** — Admin center Meetings > Conference bridges lists all bridge numbers; admins can add/remove numbers, change the default bridge number, and expand coverage with more toll/toll-free service numbers from other locations.
- **Caller privacy option** — By default external participants can't see dialed-in participants' phone numbers; choosing "Tones" as the entry/exit announcement type also prevents Teams reading numbers aloud.
- **Meeting entry/exit notifications (bridge setting)** — On/off; when on, choose "Names or phone numbers" (plays the caller's recorded name or number) or "Tones" (plays a beep).
- **Ask callers to record their name before joining** — Toggleable name-recording prompt for dial-in callers.
- **PIN length setting** — 4–12 digit selector in Bridge settings.
- **Automatic email toggle** — Tenant-level control of the automatic settings-change emails.
- **PowerShell equivalents** — Set-CsOnlineDialInConferencingTenantSettings with -EnableNameRecording, -EntryExitAnnouncementsType, -PinLength.

### Audio Conferencing — Invite-Number & Dial-Out Policy Controls (admin)

- **TeamsAudioConferencingPolicy (custom audio-conferencing policies)** — Controls which toll and toll-free numbers appear on an organizer's invites and whether invites may include toll-free numbers (AllowTollFreeDialIn). Two built-in policies (Global and AllowTollFreeDialInFalse); admins can create custom multi-country number-list policies, rank/reorder displayed numbers, and assign one policy per user; policy numbers take precedence over the user's individually set defaults; changes can take up to 24 hours, and pre-existing/recurring meetings need the Meeting Migration Service (or a resend) to pick up new numbers — toll-free calls into stale invites fail after toll-free is disabled for the organizer.
- **Per-user default toll/toll-free number** — Admin sets each user's default conferencing toll number (required) and toll-free number in Teams admin center or via Set-CsOnlineDialInConferencingUser (-ServiceNumber, -TollFreeServiceNumber).
- **Dial-out restriction controls** — Per-user or tenant-wide options: Any destination (default), Same country/region as organizer, Zone A countries only, Don't allow; managed under the user's "Dial-out from meetings" setting or via the fixed set of 12 predefined CsOnlineDialOutPolicy instances (e.g., tag:DialoutCPCandPSTNInternational … tag:DialoutCPCandPSTNDisabled) that combine conferencing dial-out and end-user PSTN calling restrictions.
- **"Domestic" definition** — A call is domestic when the dialed number is in the country/region where the meeting organizer's Microsoft 365 tenant/user is set up.
- **Send conference info in email (per user)** — One-click admin action emailing the user their dial-in info (PIN excluded).

### Audio Conferencing — Licensing Models

- **Who needs a license** — Only organizers/hosts of dial-in meetings need an Audio Conferencing license; dial-in and dial-out attendees need none; Audio Conferencing does not require a Teams Phone license.
- **Standard Audio Conferencing license (paid add-on / E5)** — Included in Microsoft 365/Office 365 E5; purchasable as an add-on for Microsoft 365 Business Standard, E1, E3, F1/F3, A1/A3, G3, and Teams standalone (Teams Enterprise/EEA) plans. Includes unlimited toll dial-in for all supported countries/regions, Operator Connect Conferencing eligibility, and 60 dial-out minutes per user per month to non-premium numbers in Zone A countries/regions.
- **Tenant-pooled dial-out minutes** — The 60 min/user/month is pooled at tenant level across assigned licenses (e.g., 115 licensed users = 6,900 min/month shared); the pool covers dial-out to any Zone A destination regardless of organizer location; non-Zone A calls never draw from the pool and always bill via Communications Credits; after pool exhaustion dial-out (including Call me) stops unless Communications Credits are configured and licensed to the organizer.
- **"Microsoft Teams Audio Conferencing with dial-out to USA/CAN" (free license)** — No-cost Audio Conferencing SKU whose dial-out is limited to US and Canada numbers only; otherwise same capabilities as the Standard license; its minute pool is sized by licenses actually assigned to users (e.g., 100 bought / 20 assigned = 1,200 minutes).
- **Audio Conferencing pay-per-minute (Volume Licensing only)** — Alternative SKU with no per-user monthly fee: all usage (inbound toll, inbound toll-free, and outbound dial-out) is billed per minute from Communications Credits (required); excluded from the 60-minute Zone A benefit and complimentary dial-out; obtainable only through a Microsoft account representative; can coexist with E5/standalone subscriptions on the same tenant; no separate per-user Communications Credits license assignment needed for conferencing usage.
- **Communications Credits** — Prepaid tenant balance (with optional auto-recharge) required for toll-free dial-in usage, dial-out beyond the minute pool, dial-out to non-Zone A/international destinations, and all pay-per-minute usage; the Communications Credits license must be assigned to the meeting organizer for per-minute billed dial-out.
- **Complimentary dial-out (Russia, South Korea, Taiwan)** — In these markets Communications Credits aren't supported, so subscription customers instead get a complimentary tenant-pooled 900 minutes/user/month of dial-out to the 44 Zone A countries/regions; overages/non-Zone A require Communications Credits; doesn't apply to pay-per-minute licenses.
- **Zone A concept** — A defined list of 44 countries/regions to which included/pooled dial-out minutes apply; premium numbers excluded.
- **Operator Connect Conferencing** — Puts third-party operator phone numbers (from Operator Connect carriers) on the tenant's conference bridge: either mixed Microsoft + operator numbers (needs Audio Conferencing Standard, with per-call choice of outbound routing) or operator-only numbers via the separate "Operator Connect Conferencing" add-on license (all outbound routed via operator, operator bills for its numbers); benefits include operator-managed SBC infrastructure, admin-center number assignment, operator SLAs/support, coverage where Microsoft Audio Conferencing isn't available, and operator pay-per-minute models; meeting participants need no license.
- **Trial** — A "Try or purchase Audio Conferencing" flow provides trial Audio Conferencing licenses before buying.
- **Government clouds** — Audio Conferencing exists in GCC High and DoD, with dedicated dial-in user portals (dialin.cpc.gov.teams.microsoft.us / dialin.cpc.dod.teams.microsoft.us).

### Audio Conferencing — Country Coverage, Monitoring & Notifications

- **Purchase availability list** — Microsoft maintains a per-country availability matrix (~115+ countries) covering whether Audio Conferencing can be purchased, whether shared dial-in numbers are auto-assigned, and whether toll/toll-free service numbers are available in each market.
- **No universal dial-in number list** — There is deliberately no single published list of every dial-in number; availability is checked per country page, and a "phone number support" request can be filed for specific cities/area codes (fulfillment depends on inventory).
- **Toll number inventory caveats** — Toll number availability varies with inventory; Venezuela, Indonesia, and UAE tenants receive no automatic toll number.
- **Auto attendant languages** — Audio Conferencing supports a documented set of prompt languages; up to four languages (1 primary, 3 secondary) configurable per dedicated number.
- **PSTN minute pools usage report** — Teams admin center > Analytics & reports > Usage reports > "PSTN minute pools"; the Zone A dial-out pool appears as "Outbound Calls to Zone A Countries and Regions."
- **80% / 100% pool exhaustion alerts** — Automatic email notifications to a broad list of admin roles (Billing, Global, User, Helpdesk, Teams Administrator, Teams Communications Administrator, etc.) when the tenant dial-out minute pool hits 80% and 100% utilization.
- **Settings-change emails** — Users receive automatic emails with dial-in info/PIN at enablement, settings change, and PIN reset (tenant-toggleable; admins can also trigger a per-user info email manually).

### Capacities & Cross-Cutting Licensing Notes

- **Meeting duration** — Up to 30 hours per meeting/event.
- **Participant limits** — 1,000 interactive (Enterprise) / 300 (Business) + 10,000 view-only = 11,000 max in meetings; events scale to 100,000 with the Attendee Capacity Pack.
- **Two recurring license gates** — "Teams Premium" (per-user add-on, ~$10/user/month, requires an underlying M365 + Teams license) and "Microsoft 365 Copilot" (separate per-user add-on). Intelligent recap accepts either; audio/video recap, real-time Copilot Q&A, custom summary templates, Facilitator, and Channel Agent require Copilot specifically.
- **April 1, 2026 licensing change** — Advanced webinar features (green room availability, manage-what-attendees-see, waitlist, manual approval, registration windows, custom emails, RTMP-In) and large-event features (eCDN, ULL, 1080p, silent test, event insights, custom emails, chat/reactions/polls at scale) moved from Teams Premium into Teams Enterprise. Teams Premium retains advanced meeting protection (E2EE, watermarking, sensitivity labels, screen-capture prevention), branding/personalization (themes, org backgrounds, templates), intelligence (intelligent recap, live translated captions/transcripts), advanced Virtual Appointments, advanced collaboration analytics, and the Queues app; pre-April-2026 Premium purchasers keep the old feature set until license expiry.
- **Organizer vs attendee license application** — Translated captions/transcripts, watermarks, E2EE, who-can-record, themes, and templates apply at the organizer level (benefit all attendees); recap markers/chapters, custom backgrounds, decorate-my-background, and quality alerts apply per licensed user; collaboration analytics and appointment analytics are admin-level.
- **Teams Premium trials** — 30-day admin trial (25 licenses) and 60-day user self-service trial; features stop immediately at trial expiry with no grace period.

## Part 3 · Calling, Teams Phone & Devices + VoIP Calls + Payments

### Making Calls: 1:1 and Group VoIP (no Teams Phone license required)

- **Audio/video call buttons in chat header** — Every 1:1 or group chat has "Video call" and "Audio call" buttons in the upper-right; one click converts the chat into a private call that never appears in team/channel conversations, though a call entry is logged into the chat itself.
- **Any call can toggle modality** — Every call can be started as video or audio-only, and video can be turned on/off mid-call; there is no separate "video call" product surface.
- **Call from a new chat compose** — Type names into the "To:" field of a new message and hit the call buttons before ever sending a message, starting an ad-hoc 1:1 or group call.
- **/call command** — Typing `/call` in the search/command box and then a person's name (or number) launches a call directly from the keyboard.
- **Call from profile card / hover** — Hovering over anyone's profile picture (in channels, chats, or search results) opens their profile card with audio/video call buttons, so a call can start from anywhere a person's avatar appears.
- **Call from search results** — People found via Teams search can be called from their result's profile card without opening a chat first.
- **Call from Calls app surfaces** — Calls can be initiated from call history entries, speed dial tiles, voicemail entries, and the People/contacts list, each with a one-click Call button.
- **Peer-to-peer VoIP included in base license** — Any user with a Microsoft 365 plan that includes Teams can make 1:1 and group VoIP calls to other Teams users; Teams Phone plus PSTN connectivity (Calling Plan/Direct Routing/Operator Connect) is required only for dial-pad/phone-number calling.
- **Federated external calls** — VoIP calls can be placed to Teams users in other organizations (external access/federation permitting), from chat or search, without any PSTN licensing.
- **iOS local-network permission for P2P** — On iOS 14+, Teams may request local network access to optimize peer-to-peer call media paths.

### Group Calls and Limits

- **Group call from group chat** — Hitting the call button in a group chat rings the chat's members and starts a group VoIP call; the call is private to those participants.
- **20-participant cap on chat-based calls** — Up to 20 people can be on the same chat-started (non-meeting) call; if a group chat has more than 20 members, the call buttons are disabled entirely (larger gatherings must use scheduled meetings, which scale to 1,000).
- **Add someone to an in-progress call** — During any call, People/Participants > Add lets you type a name (or phone number, if PSTN-licensed) to pull a new person in, escalating a 1:1 call into a group call in place.
- **In-progress call indicator in chat** — A call started in a group chat surfaces in that chat so members who missed the ring can see a call is ongoing and join it (join affordance availability varies by client; present on web).

### Answering and Incoming-Call Experience

- **Incoming call toast with three actions** — An incoming call raises a notification with "Accept with audio," "Accept with video," and "Decline" buttons; on mobile it's a full-screen Answer/Decline UI, and on Surface Hub tapping the notification answers.
- **Ring on all signed-in endpoints** — Calls ring the user's signed-in Teams clients (desktop, mobile, web, Teams phone devices) simultaneously; answer on any one of them.
- **Call waiting while on a call** — A second incoming call can be answered while already on a call; the first call is automatically placed on hold rather than dropped, with an optional call-waiting beep notification (toggle in settings).
- **Incoming call window size choice** — Settings let users choose a large or small (compact) incoming call notification window on desktop.
- **Distinctive ring alerts** — Users can set separate ringtones for calls directly to them, forwarded calls, and delegated calls, so call type is audible before looking.
- **Screen stays awake during calls** — The device screen won't auto-lock while a Teams call is active.

### In-Call Controls

- **Hold with participant notification** — Hold (call controls or More actions) pauses the call; everyone is notified they're on hold and can't see or hear anything until resumed.
- **On-hold call stack** — Held calls are listed on the left side of the call window, and users can switch between an active call and any held call.
- **Music on hold** — Default, streaming, or tenant-uploaded custom hold music plays to held callers.
- **Call merge** — While on a 1:1 or group call, a second (new or answered/held) call can be merged into the first via More actions > Merge, combining both into a single call; not available for boss/delegate shared-line calls.
- **Call merge/consult into meetings** — From a meeting's People tab, "Consult and merge" lets a participant privately call someone and then merge them into the meeting (organizer needs Audio Conferencing or PSTN license for phone-number cases; not supported for webinars/town halls).
- **Screen/content sharing in calls** — 1:1 and group calls support screen sharing via the share control, the same surface as meetings.
- **Chat during a call** — The call window exposes chat, and messages land in the underlying 1:1/group chat thread.
- **Mute, camera, device controls** — Standard controls for mute, camera toggle, and switching audio devices mid-call; a device dropdown at the lower-left of the calls experience switches speakers/mic/camera.
- **Real-time captions in calls** — Live auto-generated captions can be turned on in 1:1 and group calls (not just meetings); captions are not saved, and the capability is on by default but admin-controllable via calling policy (`LiveCaptionsEnabledTypeForCalling`).

### Call Handling: Transfer, Park, Delegation, Pickup, Forwarding

- **Call transfer (blind, "Transfer now")** — Any call can be blind-transferred to another person by typing their name; destinations include their Teams identity, their work voicemail, or other numbers on their account (PSTN-number transfers require Teams Phone licensing). A "ring back if no answer" option returns the call to you if the target doesn't pick up.
- **Consult then transfer** — Before transferring, you can consult the intended recipient by chat or a separate call, then complete the transfer; consult is not available in the web client. With transcription on, Copilot can generate an AI transfer-context summary for the recipient (licensing gate: Microsoft 365 Copilot).
- **Transfer between devices** — Move a call in progress from PC to mobile (or another signed-in device) without interruption.
- **Transfer to voicemail mid-call** — Transfer an active call directly to a user's voicemail (not yet in GCC High/DoD).
- **Call park and retrieve** — Park a call in the cloud and retrieve it from any supported device with a generated unique code; custom park policies control park timeout/ring-back and larger park ranges. Teams Phone license required.
- **Call delegation / shared-line appearance** — Share a phone line with delegates who make and receive calls on the delegator's behalf with per-delegate permissions; supports barge into delegated calls, shared call history, and per-user notification preferences. Teams Phone license required for the delegator.
- **Call groups / group call pickup** — Users define a group of members who can answer their calls, ringing all-at-once or in a defined order (groups of six or more auto-switch to everyone-at-once), with recipients choosing how they're notified (ring, banner, mute). Teams Phone license required to create a group; being a member does not require one.
- **Call forwarding rules and simultaneous ring** — Forward or simultaneously ring to colleagues, call groups, or PSTN numbers, including delayed simultaneous ring and forward-if-unanswered timers; forwarding to arbitrary phone numbers requires Teams Phone licensing.
- **Redirect external calls only** — Send inbound external/PSTN calls to forwarding settings (e.g., voicemail) while internal calls still ring normally.
- **Busy on Busy** — Calling policy controlling what happens when the user is already in a call: busy signal, route per unanswered settings, or allow voicemail; admin-set with optional user control.
- **Presence-based call routing / Do Not Disturb** — Inbound calls suppressed by presence, with priority-contact exceptions.
- **Private Line** — A secondary, inbound-only private number that rings with a distinct notification and bypasses delegates/normal routing (Teams Phone license; not in GCC High/DoD).
- **Multi-line** — Multiple phone numbers on one user account, including alternate numbers from outside the user's primary usage location (Teams Phone license; not in GCC High/DoD).
- **Secondary ringer** — Ring an additional audio device (e.g., desk speakers plus headset) on incoming calls so calls aren't missed with the headset off.
- **Call blocking (user)** — Users maintain a personal blocked-caller list of PSTN numbers and can toggle blocking of calls with no caller ID. Teams Phone license required for PSTN blocking.
- **Inbound call blocking (tenant)** — Admin-defined number-pattern (regex) blocking of inbound PSTN calls tenant-wide.
- **SMS in Teams** — SMS support for users with Microsoft Calling Plan numbers in the US (incl. Puerto Rico) and Canada.

### PSTN Connectivity Options (Teams Phone)

- **Microsoft Calling Plans** — All-in-the-cloud option where Microsoft itself is the PSTN carrier; numbers are purchased and managed directly in the Teams admin center with no SBC or separate carrier contract. Available in ~34 countries (mainly US/Western Europe); offered as Domestic, International, and Pay-as-you-go plans on top of a Teams Phone license.
- **Operator Connect** — Certified third-party operators deliver PSTN calling into Teams with the operator managing the SBC infrastructure; numbers are provisioned into the tenant through the operator's integration with the Teams admin center. Requires a Teams Phone license plus a subscription with a participating operator.
- **Direct Routing** — Connect any carrier/trunk to Teams via a customer-owned or hosted certified Session Border Controller (SBC); most flexible option for complex environments, multi-step migrations, and countries without Calling Plans/Operator Connect. Supports dial plans, voice routing policies, and least-cost routing configurations.
- **Teams Phone Mobile** — A SIM-enabled mobile number becomes the user's Teams Phone number (single number across mobile network and Teams), delivered via participating mobile operators; users can move calls seamlessly between the native dialer and Teams.
- **Media bypass (Direct Routing only)** — Keeps call media flowing directly between the Teams client and the SBC rather than hairpinning through Microsoft's cloud, improving latency and quality. Requires Teams Phone license.
- **Local Media Optimization** — Direct Routing variant of media path control for branch-office topologies where media stays within the local network region.
- **Mixed connectivity** — Calling Plan/Operator Connect and Direct Routing can be combined in one tenant, and per user, to serve different sites/countries.
- **Shared Calling** — A group of users shares one phone number (via a resource account/auto attendant) and one calling plan or trunk for inbound and outbound PSTN calls; configured with the TeamsSharedCallingRoutingPolicy, including designated emergency callback numbers. Cuts per-user number/plan costs; not available in GCC High/DoD.
- **Communications Credits / Pay-as-you-go** — Consumption billing for overages such as toll-free dialing and international minutes on domestic plans.
- **Unassigned number routing** — Routes calls made to any unassigned number in the tenant to a user, auto attendant, call queue, or custom announcement. Teams Phone license required.
- **Dial plans / number normalization** — Tenant and per-user dial plans with normalization rules translate dialed digits (extensions, national formats) into E.164 for routing. Teams Phone license required.
- **Telephone number management** — Admin center acquisition, porting, and assignment of subscriber, service, and toll-free numbers, including number search by area/city. Teams Phone license required.
- **Teams Phone extensibility / contact center** — Certified contact center integration models (Connect, Extend, and Azure Communication Services–based Teams Phone extensibility) let third-party contact center platforms use Teams Phone connectivity.

### Auto Attendants

- **Menu-based call routing** — Auto attendants present menus that direct callers to specific people, call queues, external phone numbers, other (nested) auto attendants, or shared/personal voicemail. Requires a Teams Phone Resource Account license (free) on the resource account.
- **Business hours / after hours / holiday routing** — Separate call flows can be defined for business hours, after hours, and configurable holiday schedules.
- **Text-to-speech or uploaded audio prompts** — Greetings and menu prompts can be system-generated TTS or uploaded recorded audio files.
- **Speech recognition + DTMF input** — Callers can navigate menus by voice command or phone keypad.
- **Dial-by-name and dial-by-extension directory search** — Callers can search the organization's directory; a *dial scope* controls which users (by group) are searchable.
- **Operator option** — Each auto attendant can define an operator target so callers can reach a live person.
- **Per-attendant language and time zone** — Each auto attendant has its own language and time zone; multiple attendants can be created for multilingual/multiregion needs.
- **Click-to-call web reach** — External callers can reach auto attendants via web click-to-call, not just phone numbers.
- **Teams Phone Agent (preview)** — AI extension of auto attendants providing conversational call screening, Q&A, and appointment management with Copilot Studio integration for workflows like billing or order status; currently in the Frontier public preview program.

### Call Queues

- **Hold-and-route queuing** — Callers wait on hold with greetings and music while calls route to agents; music on hold can be default, streaming, or custom-uploaded.
- **Routing methods** — Attendant (ring all), serial, round robin, and longest-idle agent routing options.
- **Presence-based routing** — Only routes calls to agents whose Teams presence is Available; optional per queue.
- **Agent opt-in/opt-out** — Per-queue setting allowing agents to opt out of taking queue calls.
- **Exception handling (overflow / timeout / no-agents)** — Redirect calls when no agents are logged in, when queue size exceeds a limit, or when wait time exceeds a limit — targets include people, voicemail, other queues, auto attendants, or Teams Phone Agents.
- **Conference mode** — Faster call connection to agents using conference-based joining.
- **Multi-queue membership and per-queue language** — Agents can serve multiple queues (e.g., per language).
- **Authorized users** — Delegated line-of-business users (e.g., supervisors) can change greetings, hours, and routing for queues/attendants without being full admins.
- **Shared call history and shared voicemail** — Queue/attendant calls produce shared history for agents, and shared voicemail can be delivered to a Microsoft 365 group.
- **Call priorities for call queues** — Assign priority levels so certain callers are answered ahead of others.
- **Queues app (Teams Premium)** — A dedicated Teams app for queue agents and leads: real-time queue metrics, agent opt-in management, outbound calling on behalf of the queue, CRM screen pop-style analytics, plus supervisor **Monitor, Whisper, Barge, and Takeover** of live agent calls (progressively escalated states). Requires Teams Premium + Teams Phone per user; controls gated by voice applications policies.
- **Compliance Recording for Call Queues** — Records all agent-answered inbound queue calls without assigning recording policies to individual agents; requires conference mode and works with all routing methods.
- **Call queue agents on SIP devices** — SIP Gateway-connected phones can serve as queue agents, though presence-based routing is unsupported since SIP Gateway doesn't publish presence.

### Voicemail (Cloud Voicemail)

- **Cloud Voicemail with Exchange delivery** — Voicemail is automatically provisioned for Teams users without requiring a Teams Phone license; messages are stored in the user's Exchange Online mailbox and delivered as email with an audio attachment, playable in all Teams clients, Outlook, and certified phones.
- **Voicemail tab in Calls** — Calls > History > Voicemail lists voicemail messages; selecting one shows caller contact details in the right panel.
- **In-app playback controls** — Voicemails play inside Teams with pause/rewind/fast-forward controls and adjustable playback speed.
- **Voicemail transcription** — Automatic speech-to-text transcription of each voicemail shown alongside the audio, toggleable by policy.
- **Transcription profanity masking** — Voicemail policy option that masks profanity in the transcription text.
- **Transcription translation** — Voicemail policy option to translate voicemail transcriptions into the user's language.
- **Call answering rules** — Per-user rules govern what happens on unanswered calls: send to voicemail (immediate or delayed redirect), play greeting then end call, transfer, or greeting-only.
- **Custom greeting recording** — "Configure voicemail" in settings lets users record a personal greeting via prompts.
- **Text-to-speech greetings** — Instead of recording, users can type a greeting that's synthesized, and set the default greeting language.
- **Out-of-office voicemail greeting** — A separate out-of-office greeting with a custom message can be configured and scheduled.
- **Call back / chat from voicemail** — More actions on a voicemail entry offers Call back and Chat, plus add-to-contacts/speed-dial.
- **Shared voicemail** — Auto attendant/call queue overflow target that deposits voicemail into a Microsoft 365 group mailbox, with optional transcription.
- **Message waiting indicator on SIP devices** — SIP Gateway-connected phones get MWI alerts for new voicemails.

### Caller ID and Spam Identification

- **Caller ID policies (CallingLineIdentity)** — Admin policies that replace a user's outbound caller ID with a service/resource-account number or anonymous, and can block incoming caller ID display.
- **Rich internal caller ID** — Internal calls show directory-driven identity (photo, job title) instead of just a number; external numbers found in the directory display directory info. Teams Phone license required.
- **User-controlled caller ID override** — Where permitted, users can choose which number (e.g., a call queue number) is presented on outbound calls.
- **Spam call identification ("Spam likely")** — Teams flags likely-spam inbound calls with a "Spam likely" caller-ID label using ML-based detection; can be disabled per user via calling policy.
- **STIR/SHAKEN attestation** — Calling Plan numbers are signed/attested to reduce outbound calls being flagged as spam by carriers.
- **Microsoft Entra reverse number lookup** — Inbound PSTN numbers are matched against Entra ID contacts to display names (not in GCC High/DoD).

### Emergency Calling (Dynamic E911)

- **Emergency addresses, places, and locations** — Validated civic addresses with optional "place" granularity (building/floor/office), each with a unique location ID; map-search creation auto-validates and attaches geo codes (latitude/longitude).
- **Dynamic emergency calling** — The client determines its current location from admin-defined network elements (subnets, WAPs/BSSIDs, switches, Ethernet ports via LLDP) matched against the Location Information Service (LIS), and sends dispatchable location with the emergency call for correct PSAP routing. Supported for Calling Plans, Operator Connect, Teams Phone Mobile, and Direct Routing; Teams Phone license required.
- **Emergency call routing policies (Direct Routing)** — Define emergency numbers, dial masks, and PSTN usage routing for emergency calls on Direct Routing; other options rely on carrier-side routing.
- **Security desk notification** — Conference or notify (chat/call) designated security personnel automatically during an emergency call, configurable per emergency number (e.g., different handling for 933 test calls).
- **Work-from-home location sharing** — Remote users can confirm or enter their address via OS location-services integration so emergency calls from home get a dispatchable location.
- **Custom emergency services disclaimer banner** — Tenant-configurable banner (up to 250 chars) prompting users to confirm their emergency address.
- **Emergency callback numbers for Shared Calling** — Shared Calling policies designate specific numbers used as emergency callback numbers for users without their own DIDs.

### Survivable Branch Appliance (SBA)

- **Branch PSTN survivability** — SBA code embedded in certified SBC vendor firmware (AudioCodes, Ribbon, Oracle, TE-Systems) keeps branch users making/receiving PSTN calls via the local SBC when the internet/Teams cloud is unreachable; clients switch automatically with a banner and fall back when connectivity returns, then upload call data records.
- **In-outage feature set** — Make/receive PSTN calls, hold/resume, blind transfer, call forwarding (including unanswered), redirect of inbound queue/attendant numbers to a local agent or alternate number, VoIP fallback to PSTN, and local VoIP calls between users behind the same SBA.
- **Requirements/limits** — Requires media bypass, works on Windows/macOS desktop clients and Teams Phones only (no VMs/web), tolerates expired auth tokens up to 7 days, no E911 location sharing or emergency call routing policies in SBA mode, and CAE tokens limit operation to ~30 minutes.

### Call Recording, Transcription, and Recap

- **Convenience 1:1 call recording** — Users can start ad-hoc cloud recording (with transcription) of 1:1 VoIP and PSTN calls, gated by the calling policy `AllowCloudRecordingForCalls` (off by default); recordings are stored in the recorder's OneDrive and surfaced in the call history details panel. Cross-tenant trusted-organization calls follow the initiator's tenant policy.
- **1:1 call transcription** — Post-call transcript generation for calls, gated by calling policy `AllowTranscriptionForCalling` (off by default); the transcript is available to review after the call ends, and a recording/transcription notification is played to participants.
- **Explicit recording-consent flow for calls** — If the admin enables `ExplicitRecordingConsent` for 1:1 VoIP/PSTN calls, starting recording/transcription mutes the other participant until they answer Yes/No to consent; "No" gives them a view-only call, and consent choices are auditable in Purview.
- **Call recap** — After VoIP (and PSTN) calls, a Recap entry in call history collects the transcript, recording, notes, and shared files for that call.
- **Compliance (policy-based) recording** — Automatic, non-user-controllable recording of calls, meetings, events, and PSTN interactions via certified third-party recorder bots (NICE, Verint, ASC, Dubber, CallCabinet, Luware, Theta Lake, Imagicle, etc.) assigned through CsTeamsComplianceRecordingPolicy at tenant/user/group level. Meets MiFID II, Dodd-Frank, HIPAA, GDPR-style obligations; requires M365 E3/E5-class, Teams Rooms, or Teams Shared Device licensing per recorded user.
- **Compliance recording notices** — Visual notices on desktop/web/mobile/Teams Phones/Rooms and audio notices for SIP phones, dial-in, and PSTN callers.
- **Compliance recording exclusions** — Not supported for E911 calls, SBA-mode users, or PSTN calls for India-based users; optimized to 750 participants per meeting.

### Calls App Layout

- **Single Calls hub** — The Calls app in the left rail combines call history (center), speed dial + contact groups + voicemail (right side), and the dial pad (left; dial pad only appears with Teams Phone/calling plan licensing).
- **View contacts from Calls** — "Calls > View contacts" opens the People app for browsing and calling any saved contact.
- **Device picker in Calls app** — A connected-device dropdown at the lower-left of the calls experience selects which audio device Teams uses, without entering settings.
- **Quick access to forwarding/call groups** — The Calls app footer/menu exposes call forwarding and call-group toggles without opening full settings.

### Call History

- **Unified history list** — Chronological list of all past calls — incoming, outgoing, and missed — for both VoIP and (if licensed) PSTN calls, at the center of the Calls app.
- **History filters** — Filter chips at the top of the list narrow it to all calls, missed calls, or voicemail.
- **Per-entry More actions menu** — Hovering an entry exposes: Call back (redials immediately), Chat, Add to speed dial, Add to contacts, Add to a contact group, and Remove from view.
- **Delete syncs across devices** — Removing a call from history removes it from view on all the user's devices (admins retain the underlying CDR data).
- **Mobile history actions** — On mobile, tapping an entry's Info icon shows call details and offers delete.
- **Recap access from history** — History entries for recorded/transcribed calls expose the Recap (transcript, recording, notes, files).

### Contacts and the People App

- **People app as contact store** — Teams contacts are managed in the People app (pinnable to the left nav), holding both directory-sourced contacts and locally created personal contacts.
- **Directory-suggested add** — When adding a contact, Teams auto-suggests matches from the org directory; directory-controlled fields (name, email) stay grayed-out/read-only, while personal fields are editable.
- **Local personal contacts** — Contacts can be created from scratch with a name/phone number; new contacts also become available through Microsoft 365 in Outlook.
- **Favorites tab** — Contacts can be starred into a Favorites view for quick access.
- **Categories/tags** — Users can create custom categories and assign a contact to multiple categories; categories are Teams-only and don't sync elsewhere.
- **Profile-card view and call from contact** — Each contact opens a profile card with full details and one-click Call/Chat buttons.
- **Contact export** — Contacts can be exported (via Outlook.com / Teams Free export tooling).

### Contact Groups and Speed Dial

- **User-defined contact groups** — From Chat > Contacts (or the Calls right rail), users create named contact groups ("call groups" in the calling UX) to organize teammates by role/team; groups can be renamed and deleted.
- **Up to 64 contact groups** — A user can maintain as many as 64 contact groups.
- **Add contact to group from anywhere** — More actions on a call-history entry or group header lets you drop a person into any contact group.
- **Groups surface in the Calls right rail** — Contact groups appear alongside speed dial in the Calls app, each member callable with one click.
- **Speed dial section** — A dedicated Speed dial group sits at the top-right of the Calls app; "Add" searches by name or number and pins the person as a tile with direct audio/video call buttons.
- **Add to speed dial from history/contacts** — Any call history entry or contact can be promoted to speed dial via its More actions menu.
- **Drag-to-reorder** — Speed dial tiles can be dragged into a preferred order; the arrangement saves automatically.
- **Speed dial tied to contact groups model** — In the current calling UX, speed dial behaves as a special contact group and is managed (rename/delete membership) alongside other groups.
- **Mobile speed dial** — The mobile Calls tab surfaces the same speed dial list for one-tap dialing.

### Call Settings, Diagnostics, and Shortcuts

- **Test call** — A built-in test call service verifies mic/speaker/camera quality before real calls.
- **TTY mode** — Teletypewriter accessibility mode for text-based call communication can be enabled in call settings.
- **Default device selection** — Settings choose the default mic, speaker, camera, and noise-suppression level used for calls.
- **Call health panel** — During any call, More actions > Call health shows live network, audio, screen-share, and outgoing-video metrics (jitter, packet loss, round-trip time, bitrate), refreshed every 15 seconds, for self-troubleshooting.
- **Keyboard shortcuts for calling** — Dedicated shortcuts: accept video call (Ctrl+Shift+A), accept audio call (Ctrl+Shift+S), decline (Ctrl+Shift+D), toggle mute (Ctrl+Shift+M), toggle video (Ctrl+Shift+O), plus /call from the command box.
- **Cross-platform parity notes** — Desktop has the fullest calling surface; web lacks consult-then-transfer; mobile supports history, speed dial, voicemail, transfer, and merge through the More actions menu.

### Teams-Certified Devices

- **Certification program** — Microsoft tests devices against specs for audio/video quality, UI, management, and security; only passing devices are "Certified for Microsoft Teams." Categories: Teams phones, Teams displays, Teams panels, Teams Rooms systems (Windows and Android), and certified personal peripherals (headsets, speakerphones, webcams, monitors, bars).
- **Teams phones (desk/conference)** — Native Teams calling/meeting UI with one-touch join, calendar, voicemail, hot desking, common-area mode; managed and remotely updated from Teams admin center. Common area phones use the Teams Shared Devices license with an admin-controlled restricted interface; the advanced conference-phone "meeting interface" on Android requires a Teams Rooms Pro license.
- **Teams displays** — Dedicated ambient Teams appliances (personal or shared) with calling, calendar, Cortana voice assistance, and **hot desking**: reserve a desk, sign in for a session, and sign out clean for the next user (Teams Shared Devices license).
- **Teams panels** — Touch scheduling panels mounted outside rooms showing availability, ad-hoc reservation, and room check-in; check-in and panel licensing require Teams Rooms Pro when paired with a Pro room.
- **Certified headsets/speakerphones/webcams** — Personal peripherals with plug-and-play HID call controls (answer/end/mute), dedicated **Teams button** and LED that raises the Teams client and signals notifications/alerts.
- **SIP/DECT/ATA ecosystem via SIP Gateway** — Certified compatibility lists for Cisco MPP, Poly VVX/Trio/Edge/Rove, Yealink T-series/DECT, AudioCodes, Spectralink, Ascom, Gigaset, Algo (speakers/intercoms/paging), 2N intercoms, Avaya J100, Axis speakers/intercoms/cameras, and analog ATAs.
- **Walkie Talkie PTT accessories** — Certified BlueParrott, Jabra, and Klein Electronics headsets with dedicated PTT buttons; generic headsets work via play/pause button in Toggle-to-Talk mode.

### Teams Rooms — Basic vs Pro

- **Basic (free, max 25 rooms)** — One-touch/proximity/meeting-ID join, ad hoc meetings, Direct Guest Join for Zoom/Webex, content sharing of all Teams content types, Whiteboard, video gallery layouts, P2P/group calls, secure OS with secure boot/assigned access, Pro Management Portal enrollment/inventory, and automatic software updates. Cannot be used for Teams Panels or multiple systems per room.
- **Pro ($40/room/month; unlimited rooms)** — Everything in Basic plus: front row layout, large gallery (50 videos), dual-screen support, meeting chat on screen, show meeting names, cross-cloud join, coordinated meetings (multiple devices in one room), room check-in from a Teams panel, content camera whiteboard capture, speaker identification via intelligent speakers, multi-camera support, panoramic room view, AI noise suppression, people counting, IntelliFrame individual video tiles per in-room person, Teams Phone Standard and Audio Conferencing included, end-to-end call encryption, Intune + Entra ID P1 + Defender for Endpoint P2, Conditional Access, and advanced Pro Management (remote configuration, peripheral health, custom backgrounds, device history, ITSM integration, custom alerts, analytics).
- **Intelligent speakers** — Certified microphones that identify up to ~10 in-room voices for speaker-attributed meeting transcripts (Pro).
- **Proximity join** — Personal devices detect a nearby Teams Room via Bluetooth and add the room to a meeting with audio auto-muted to prevent echo (available across Rooms licenses as part of one-touch/proximity join).
- **Content cameras** — Certified cameras with image-processing that captures a physical analog whiteboard, makes the presenter translucent, and shares an enhanced board view into the meeting (Pro).
- **Direct Guest Join** — Rooms can join third-party Zoom/Webex meetings from the room calendar via each service's web app, and vice versa for Teams on partner rooms.
- **Surface Hub** — Runs the Teams Rooms experience and is licensed as a Teams Rooms system.

### SIP Gateway

- **Core function** — Lets compatible SIP phones (Skype for Business 3PIP, Cisco MPP, Poly, Yealink, AudioCodes, DECT systems, ATAs for analog devices) act as Teams endpoints with corporate sign-in; requires Teams Phone license + PSTN connectivity per user (not in DoD cloud).
- **Calling features on SIP devices** — Make/receive PSTN and Teams calls, hold/resume, mute, multiple simultaneous calls, local conferencing of two calls, blind and consultative transfer, voicemail with MWI, DTMF, and meeting dial-in with "Request to Join."
- **Feature codes** — Star codes for DND (\*30\*/\*31\*), call-forwarding set/reset (\*32\*–\*35\*), OTP device validation (\*55\*), and voicemail (\*99\*).
- **Local call forwarding** — Device-level forwarding rules (always/timeout/busy) honored when `AllowCallRedirect` is enabled in the calling policy.
- **Provisioning and lifecycle** — Devices provisioned via Teams admin center (including remote sign-in), auto-offboarding of stale devices (30 days paired / 14 days unpaired), and dynamic emergency-location discovery via LLDP or BSSID on supported models.
- **Tango Extend eSIM** — eSIM endpoints join Teams via SIP Gateway with sign-in policy sync, calls, voicemail/MWI, DND, and forwarding; emergency calls use the Teams number.

### Cloud Video Interop (CVI)

- **Third-party VTC join** — Certified partner gateways (Pexip, Cisco Webex, and other qualified partners) let standards-based SIP/H.323 video conferencing rooms join Teams meetings with bi-directional audio, video, and content sharing.
- **Dual-home experience** — Participant lists show both Teams and VTC participants with flexible multiscreen layouts.
- **CVI coordinates in invites** — CVI join details are added to meeting invitations, including (newer) town hall and webinar invitations.
- **SIP Guest Join** — Select certified CVI partners let an organization's existing CVI subscription join *external* organizations' Teams meetings from VTC hardware.
- **Licensing note** — CVI (like Direct Guest Join) is designed so shared VTC endpoints can join Teams meetings without a separate Teams meeting license for the endpoint.

### Walkie Talkie

- **Push-to-talk over Teams channels** — Turns Android/iOS devices (and certified rugged devices) into instant PTT radios over Wi-Fi or cellular, scoped to standard and private Teams channels the user already belongs to (shared channels unsupported); included with all Teams licenses that include the Teams app for frontline scenarios.
- **Dedicated PTT hardware support** — Integrates with BlueParrott/Jabra/Klein certified headsets with hardware PTT buttons; generic wired headsets work in Toggle-to-Talk mode via the play/pause button.
- **Admin management** — Deployed/pinned via Teams app setup policies and manageable through MDM; requires Bluetooth allowed by MDM for wireless accessories.

### Payments App — Availability, Licensing, and Platforms

- **Free first-party Payments app** — Microsoft-published app in the Teams app store/AppSource that lets small businesses request and collect customer payments directly inside Teams, installed at no additional charge. Licensing gate: included with Teams Essentials and Microsoft 365 Business (Basic/Standard/Premium) SMB plans; positioned at SMBs but usable by businesses of any size with a Teams/M365 subscription.
- **Public preview rollout (MC445767)** — Announced via the Microsoft 365 Message Center; shipped to the Teams app store in December 2022 (originally slated November 2022) as a Public Preview, with the broad marketing launch in May 2023 during National Small Business Week.
- **Geographic gate: US and Canada** — Official sources limit merchant eligibility to businesses registered in the United States and Canada; no official source corroborates UK availability.
- **Cross-platform** — Works in Teams on Windows desktop, Mac, web, Android, and iOS; payment requests can be sent and paid from desktop or mobile during a meeting.
- **Launch promotion** — At launch Microsoft paired the app with a 15% first-year discount on Microsoft 365 Business Basic/Standard bought via microsoft.com during National Small Business Week.
- **Status caveat** — Both official Microsoft Support articles for the app now return "This article has been retired," and payment collection is absent from current Teams webinar-registration guidance (an April 2024 Microsoft Q&A answer states Teams offers no native payment processing in the registration workflow); no Message Center retirement notice was found, and the app remained described as "public preview" in the latest available references.

### Payments App — Provider Connections

- **Connect-a-service model** — After installing, the business connects the app to one or more third-party payment processors; the app then routes requests/charges through the connected account. Supported processors: Stripe and PayPal at launch, with GoDaddy Payments added shortly after (announced May 2023).
- **Stripe integration (via Stripe Connect)** — Stripe Connect handles merchant onboarding and identity verification for Teams transactions; Microsoft programmatically routes customer payments to the merchant through Stripe Connect after each transaction, funds are available "in seconds," and Stripe supports requiring payment in advance of a Teams session.
- **PayPal integration** — Requires a PayPal business account (personal PayPal accounts are not supported); once linked, customers can pay with the payment methods PayPal supports.
- **GoDaddy Payments integration** — Priced at 2.3% + $0.30 per online transaction with deposits as early as the next business day, no long-term contracts and no monthly minimums; enabled on Teams desktop and mobile.
- **Microsoft takes no cut** — The app itself is free; only the connected processor's standard transaction fees apply.

### Payments App — Requesting and Tracking Payments

- **Payments messaging extension in the meeting chat** — The host opens the meeting chat and selects the Payments icon from the messaging extensions (compose bar) to raise a payment request without leaving the meeting.
- **Payment request form** — Host fills in the amount, what the payment is for, and the recipient(s); entering multiple names in the "Send to" field sends the same request to several attendees at once (e.g., a paid class).
- **Payment card posted in chat** — Sending the request generates a card in the meeting chat showing each recipient and a per-person payment status; the status under each customer's name flips from Unpaid to Paid as they complete payment.
- **Customer "Pay now" flow inside Teams** — Attendees see the same card in their meeting chat and click Pay now, then pay by credit card, debit card, digital wallet, or other methods supported by the connected processor — no redirect to an external app or website; card data is transmitted to the payment provider for processing, and approved funds deposit to the merchant's processor account.
- **Before / during / after timing** — Requests can be sent in real time before, during, or after the meeting itself — covering pre-paid sessions (advance payment via Stripe), in-session collection, and post-session invoicing of the same meeting chat.
- **Activity-feed notification** — Payment requests also surface in the recipient's Teams activity feed, so a request sent outside the live meeting window is still seen.
- **Dedicated payments pane/dashboard in Teams** — The app provides a pane where the business tracks payments made and still outstanding (pending vs. received) across meetings, without leaving Teams.
- **Per-request status tracking** — Each request card doubles as a live status tracker (Unpaid/Paid per customer), giving in-context reconciliation for multi-attendee sessions.

### Payments App — Target Scenarios and Admin Controls

- **Paid virtual appointments and consultations** — E.g., lawyers or financial advisors collecting fees for consultative appointments held in Teams; complements the Bookings/Virtual Appointments scheduling stack, which itself has no native payment step.
- **Paid classes, tutoring, and training** — Teachers collecting for tutoring classes; real-estate instructors charging for license-renewal sessions; tutors in live virtual sessions.
- **Paid webinars and events** — Collecting fees for webinars, one-on-one sessions, and events hosted in Teams — positioned as the way to monetize any meeting hosted in Teams (payment is via chat request, not built into webinar registration).
- **Cash-flow positioning** — Marketed against late-payment pain (93% of businesses report managing late payments) by securing payment at or before service delivery.
- **Managed like any Teams app** — IT admins allow/block the Payments app under Teams apps > Manage apps and govern availability via app permission and app setup policies; policy changes take roughly a couple of hours to take effect.
- **Merchant account linking is per-business self-service** — Connecting Stripe/PayPal/GoDaddy accounts is done in-app by the business user (authenticating to the provider establishes the API link), not a tenant-level admin configuration.

## Part 4 · Administration, Security & Compliance + Clients, Plans & Variants

### Teams Admin Center (TAC)

- **Manage Teams view (Teams > Manage teams)** — Central inventory of every team in the tenant with team profile pages; admins can create teams, add/remove members and owners, change privacy settings, and edit channels without being a team member.
- **Unified "Settings & policies" experience** — Newer TAC navigation consolidating org-wide default settings and custom policies for users and groups under one tab, replacing scattered per-workload policy pages.
- **Org-wide Teams settings** — Tenant-level toggles for notifications/suggested feeds, tagging (who can manage tags, suggested/custom tags, Shifts-driven tags), channel email integration (with SMTP domain allowlist), third-party cloud storage providers (Dropbox, Box, Google Drive, Citrix, Egnyte), the Organization (org chart) tab, device settings (Surface Hub, content PIN), Exchange address-book-policy scoped directory search, supervised/role-based chat, and shared-channel support links.
- **External access and guest access controls** — Org-wide settings governing federation with other Microsoft 365 orgs (domain allow/block lists), Teams accounts not managed by an org, Skype users, and guest experience toggles.
- **Team templates & template policies** — Admins can create custom team templates (pre-defined channels, tabs, apps) and use template policies to control which templates (Manage a Project, Incident Response, Hospital, Bank Branch, Frontline Collaboration, etc.) users see at team creation.
- **Customize app store** — Brand the in-tenant Teams app store with org logo, logomark, and custom background/color.
- **Teams Advisor (Advisor for Teams)** — Deployment planning tool in TAC that creates a deployment team with plans/tasks (Planner-based) for rolling out chat, meetings, and voice workloads.
- **Teams admin roles (Entra roles)** — Granular delegated administration: Teams Administrator, Teams Communications Administrator, Teams Communications Support Engineer/Specialist, Teams Device Administrator, Teams Telephony Administrator, and Global Reader for read-only access.
- **Device management** — TAC manages certified Teams devices (Teams Rooms, phones, displays, panels): inventory, remote sign-in/restart, configuration profiles, firmware/software updates, and device health monitoring.
- **Teams upgrade settings** — Skype for Business coexistence modes (Teams Only, Islands, etc.), upgrade notification banners, and preferred meeting-join app during migration.

### Policies (Per-User and Org Defaults)

- **Messaging policies** — Control chat/channel messaging features per user: message deletion/editing, chat toggle, Giphy (with content rating), memes/stickers, read receipts, priority notifications/urgent messages, voice messages, translation, immersive reader, and chat permission role (supervised chat).
- **Meeting and event policies** — Control organizer/participant capabilities: private/channel meeting scheduling, Meet Now, Outlook add-in, meeting registration, attendance/engagement reports (with attendee opt-out and detail controls), anonymous join, lobby bypass rules (including dial-in callers), who can present, screen sharing scope, give/request control (internal and external), PowerPoint Live, Whiteboard, collaborative annotations, shared notes, Live Share co-editing, chat-copy/forward restriction, recording, transcription, live captions (including CART captions), recording auto-expiration (default 120 days), watermarking (Teams Premium), Copilot in meetings mode (Copilot license), Q&A, reactions, external meeting chat and join controls, view-only overflow mode, presenter-role permission reduction, and attendee identity masking.
- **Live events policies and events policies** — Control who can schedule live events, webinars, and town halls, recording options, transcription for attendees, and production types (Teams-produced vs external encoder).
- **Meeting templates and meeting template policies** — (Teams Premium) Admin-built meeting templates that lock or default meeting options (lobby, chat, recording, watermark, encryption); template policies scope which templates users can pick, including the Virtual Appointment template.
- **Customization policies** — (Teams Premium) Organization branding of meetings: custom logos, backgrounds, and themes in the meeting experience.
- **Calling policies** — Control voice features per user: make private calls, call forwarding/simultaneous ring, voicemail availability, call groups, delegation, prevent toll bypass, busy-on-busy, web PSTN calling, spam-call filtering, and SIP devices.
- **App permission policies / app-centric management** — Control which Microsoft, third-party, and custom apps users may install (allow all / allow specific / block specific / block all); newer tenants use app-centric management assigning apps to users/groups directly.
- **App setup policies** — Pin apps to the Teams app bar and messaging extensions in a set order, auto-install apps on behalf of users, allow custom-app upload (sideloading), and permit/deny user pinning.
- **Teams (channel) policies** — Control private team discovery, private channel creation, shared channel creation, inviting external users to shared channels, and joining external shared channels; PowerShell-only `AllowOrgWideTeamCreation` gates who can create org-wide teams.
- **Teams update policies** — Control enrollment in Teams Public Preview / prerelease features per user (`Set-CsTeamsUpdateManagementPolicy -AllowPublicPreview`).
- **Emergency calling policies** — Configure dynamic E911 behavior: external location lookup mode (users set emergency address off-network), security-desk notification mode (notify only, conference in muted/unmuted), disclaimer banner, and a PSTN number plus up to 50 users/groups notified on emergency calls.
- **Emergency call routing policies** — Enable dynamic emergency calling for Direct Routing users, with emergency numbers and routing based on network location.
- **Other voice policies** — Call hold policies (custom hold music), call park policies, caller ID policies (mask/replace caller ID with service numbers), mobility policies (cellular data restrictions), shared calling policies, voice routing policies (Direct Routing PSTN usage records), voicemail policies, and voice applications policies (delegated call queue/auto attendant management).
- **Enhanced encryption policies** — Per-user policy enabling end-to-end encryption for 1:1 calls, and E2EE for meetings (meeting E2EE requires Teams Premium).
- **Conference bridge settings** — Toll/toll-free dial-in numbers, PIN length, and entry/exit announcements for audio conferencing.
- **Audio conferencing settings** — Dial-out limits, toll-free usage, and operator-connect conferencing.

### Policy Assignment & Policy Packages

- **Direct, batch, and group-based policy assignment** — Assign a policy to individual users, to batches (up to 5,000 per batch operation), or to groups with ranked precedence rules; group membership changes flow through automatically.
- **Policy packages** — Pre-defined bundles of messaging/meeting/calling/app setup/live-events policies for personas (e.g., Education teacher/student, Healthcare clinical worker, Frontline manager/worker, Small business, Public safety officer); assigning the package applies all policies in one action and package updates propagate to assignees. Government-specific packages exist for gov clouds.
- **Policy precedence engine** — Deterministic effective-policy resolution: direct assignment wins over group assignment (by ranking), which wins over the org-wide default.

### PowerShell & Graph Administration

- **MicrosoftTeams PowerShell module** — Full scripting of TAC capabilities: team CRUD (`New-Team`, `Get-Team`), channels/members, all `-CsTeams*` policy cmdlets (create/set/grant policies at scale), policy package cmdlets, batch policy assignment, Direct Routing configuration, emergency locations, and phone number management.
- **PowerShell-only policies/settings** — Some controls exist only in PowerShell (e.g., `AllowOrgWideTeamCreation`, `BlockedAnonymousJoinClientTypes`, `StreamingAttendeeMode`, `AttendeeIdentityMasking`, `LimitPresenterRolePermissions`).
- **Microsoft Graph Teams APIs / Microsoft.Graph.Teams module** — Programmatic team/channel/membership/tab management, team archiving (`Invoke-MgArchiveTeam` / archive API), teamwork settings, chat message access (protected APIs for compliance export), team provisioning from templates, and automation of lifecycle at scale.
- **Exchange Online PowerShell for Teams protection** — `*-TeamsProtectionPolicy` and `*-TeamsProtectionPolicyRule` cmdlets configure ZAP-for-Teams quarantine behavior and exceptions.

### Identity & Access (Microsoft Entra)

- **Single sign-on via Microsoft Entra ID** — Teams identities are Entra identities; modern authentication (MSAL-based) on desktop, mobile, and web clients.
- **Multifactor authentication** — Team-wide and org-wide two-factor authentication enforced via Entra MFA methods (Authenticator, FIDO2, etc.).
- **Conditional Access** — Teams is a distinct cloud app in Entra Conditional Access; policies can require MFA, compliant/hybrid-joined devices, block legacy auth, or restrict locations. CA policies on Exchange Online and SharePoint also apply to Teams because Teams depends on them for meetings/calendar/files.
- **AppLocker support** — Teams desktop client supports Windows AppLocker application-control policies.
- **Mobile application management (MAM) with Intune** — App protection policies (block copy/paste, require PIN, wipe corporate data) for Teams mobile apps.
- **Cross-tenant access settings** — Entra B2B direct connect powers shared channels with external orgs and B2B collaboration governs guest access, both governed by cross-tenant trust settings.
- **Secure Score integration** — Teams-specific security recommendations surface in Microsoft Secure Score for posture measurement and KPIs.

### Sensitivity Labels (Microsoft Purview)

- **Sensitivity labels on teams** — Labels (configured in Purview) applied at team creation control team privacy (public/private), guest access allowance, external sharing from the team's SharePoint site, and access from unmanaged devices; the label appears on the team UI. Requires Entra ID P1 for group label support.
- **Sensitivity labels on meetings and calendar items** — Labels applied to meeting invites enforce meeting options end-to-end: lobby, who can present, chat restrictions, recording behavior, watermarking, E2EE, and prevent copy of chat; the label inherits from the invite to the live meeting. Meeting label options require Teams Premium (label infrastructure itself requires E5/Purview information protection licensing).
- **Label + meeting template + policy layering** — Microsoft documents reference configurations for "sensitive" and "highly sensitive" meeting protection combining labels, templates, and admin policies (watermark + E2EE + restricted recording; Teams Premium).
- **Channel-message labeling & DLP interplay** — Labeled content in SharePoint behind teams is honored by DLP and search.

### Data Loss Prevention (DLP)

- **DLP for Teams chat and channel messages** — Purview DLP policies detect sensitive info types (credit cards, IDs, custom SITs, trainable classifiers) in sent messages and can block the message, show policy tips, notify users, and generate incident reports. Requires E5/Compliance/Information Protection & Governance licensing for Teams-location DLP.
- **DLP on files shared in Teams** — Files shared in chats/channels are protected via SharePoint/OneDrive DLP locations.
- **Policy tips and user overrides** — Configurable end-user education with override + business-justification options and audit of overrides.

### Retention

- **Retention policies for Teams chats and channel messages** — Purview retention with separate locations for Teams chats, channel messages, private channel messages, and shared channel messages; retain, delete, or retain-then-delete; minimum retention/deletion granularity down to 1 day; messages stored in hidden Exchange folders (SubstrateHolds) for compliance.
- **Adaptive vs static retention scopes** — Adaptive scopes target users/groups by attributes; static scopes pick specific users/teams.
- **Teams meeting recording retention** — Recordings in OneDrive/SharePoint fall under those workload retention policies; separate meeting-policy auto-expiration (default 120 days) is admin-configurable per policy.
- **Preservation of edited/deleted messages** — Retention keeps immutable copies discoverable by eDiscovery even after user deletion/edit.

### eDiscovery & Legal Hold

- **Content search** — Search all Teams data (chat, channel messages, meetings, calls metadata, files) with Teams-specific filters (Chat and Channel Messages, Meetings, Calls) and export results; no case required.
- **eDiscovery (Standard)** — Case management, holds, search, and export of Teams content.
- **eDiscovery (Premium)** — (E5/Compliance add-on) Custodian management, legal-hold notifications, review sets, analytics/relevance (predictive coding), conversation threading for Teams chats, and export; produces meeting/call summary events.
- **Legal hold** — Place a user (mailbox) or an entire team (group mailbox + SharePoint site) on In-Place or Litigation Hold; immutable copies of deleted/edited channel messages and files remain discoverable. Private-channel messages are held via user mailboxes.
- **Up to 24-hour ingestion delay** — Teams content becomes discoverable within about 24 hours (documented limitation).

### Communication Compliance

- **Communication compliance policies for Teams** — (E5/Compliance add-on) Scan Teams 1:1 chats, group chats, public/private channel messages, and attachments for offensive/harassing language (ML classifiers), sensitive information, and regulatory-compliance violations; the remediation workflow includes remove-message-from-Teams, notify, escalate, and case creation.

### Information Barriers

- **Information barrier policies** — (E5/insider-risk licensing) Prevent specified segments of users from chatting, calling, meeting, or being in the same team; enforced at lookup, member-add, chat, call, and meeting-join time; supports 1:1, group chat, and team-level scenarios and interacts with eDiscovery lookups.

### Auditing

- **Audit log search for Teams events** — Purview Audit (Standard) logs Teams events (team created/deleted, channel changes, membership changes, settings changed, sign-ins, app installs, meeting/call events), searchable and exportable in the Purview portal with alert policies.
- **Audit (Premium)** — Longer retention of audit records (1 year+, 10-year add-on), higher-value intelligence events, and greater bandwidth for the Office 365 Management Activity API. E5/add-on licensing.

### Encryption & Key Management

- **Encryption in transit and at rest** — All Teams data encrypted in transit (TLS/MTLS; media via SRTP) and at rest in Microsoft datacenters; files use SharePoint encryption and notes use OneNote/SharePoint encryption.
- **End-to-end encryption (E2EE) for 1:1 calls** — Optional per-user policy; media keys are available only to the two endpoints.
- **E2EE for meetings** — Teams Premium; enforceable via meeting templates/sensitivity labels.
- **Customer Key** — Tenant-level customer-provided root keys encrypt Teams chat messages (1:1, group, meeting, channel), media messages, stored call/meeting recordings, notifications, suggestions, and status messages; application-level Customer Key covers Teams files in SharePoint. Requires E5/Compliance licensing.
- **Customer Lockbox** — Requires explicit customer approval before Microsoft engineers can access tenant content during support operations (E5/add-on; applies to Teams as part of M365 coverage).

### Threat Protection (Defender for Office 365)

- **Built-in protections (all Teams licenses)** — Anti-malware scanning of files in SharePoint/OneDrive/Teams, near-real-time URL warnings on malicious links in Teams messages (including retroactive warnings up to 48h post-delivery), and an external domain anomalies report.
- **Safe Links for Teams** — (Defender for Office 365 Plan 1+) Time-of-click URL scanning/rewriting for links in Teams chats and channels.
- **Safe Attachments for SharePoint/OneDrive/Teams** — (Plan 1+) Detonates and blocks malicious files shared through Teams.
- **Zero-hour auto purge (ZAP) for Teams** — (Plan 1+) Post-delivery quarantining of Teams messages found to be malware or high-confidence phishing, with a single tenant Teams protection policy, selectable quarantine policies, and recipient-based exclusions (users/groups/domains).
- **Teams message quarantine & entity panel** — (Plan 1+) Admin management of quarantined Teams messages and a consolidated metadata panel for SecOps triage of Teams threats.
- **User reporting of Teams messages** — (Plan 1+) Users can report Teams messages/calls as malicious; reports route to a reporting mailbox, Microsoft, or both.
- **Tenant Allow/Block List for Teams** — (Plan 1+) Block/allow domains and addresses, URLs, and files specifically inside Teams.
- **Attack-chain disruption features** — (Plan 2/E5) Admins can remove users from Teams chats from the entity panel; advanced hunting on Teams messages via MessageEvents, MessagePostDeliveryEvents, and MessageURLInfo KQL tables.

### Usage Reports & Analytics

- **TAC Analytics & reports** — Teams usage report (active users/guests, channels, messages, meetings per team), Teams user activity report (messages, calls, meetings per user), Teams device usage report, app usage report, PSTN usage/minute-pool reports, live event usage, information protection license report, external domain anomalies report, virtual appointments reports, and Teams Premium feature usage report (licensing-gated to Premium features).
- **Microsoft 365 admin center Teams reports** — Tenant-level Teams usage/user activity with 7/30/90/180-day windows and CSV export.
- **Report anonymization** — Global admin can pseudonymize user/group identifiers (MD5 hashes) in all usage reports and exports.
- **Role-gated report access** — Teams admin, Skype for Business admin, and Global Reader (aggregate-only) can view reports.
- **Graph reports API** — Programmatic retrieval of Teams usage/activity data for BI pipelines.
- **Advanced collaboration analytics** — Teams Premium analytics for collaboration security posture (e.g., external/inactive team insights).

### Call Quality Tooling

- **Call Quality Dashboard (CQD)** — Org-wide near-real-time call/meeting quality reporting (audio/video/sharing streams, server-client and client-client), voice-quality SLA views, summary/location-enhanced/reliability reports, drill-through filtering, Power BI query templates and connector, and CSV/API export.
- **Building/tenant data upload** — Upload building and endpoint CSV/TSV files so CQD and analytics map subnets/IPs to physical locations for per-building quality analysis (Location-Enhanced Reports).
- **Per-user call analytics** — In TAC user pages: per-call/per-meeting diagnostics showing device, network, connectivity, and quality telemetry for troubleshooting individual users; scoped access lets Communications Support Specialist/Engineer roles see limited vs full data.
- **Real-Time Analytics (RTA)** — (Teams Premium for full data) Live in-meeting telemetry so admins can troubleshoot quality issues while a meeting is still in progress.
- **Quality of Service (QoS) support** — DSCP marking with defined port ranges for audio/video/sharing traffic; QoS markers configurable via policy/GPO.

### Network Planning

- **Network Planner (TAC > Planning)** — Models bandwidth requirements per site using network details plus personas (Office Worker, Remote Worker, Teams Room System — auto-distributed 80/20, plus up to 3 custom personas); generates per-activity bandwidth reports, flags shortfalls in red, with adjustable allowed-bandwidth percentage; replaced the MyAdvisor bandwidth calculator.
- **Network topology (trusted IPs / network sites)** — Define subnets, network sites, and trusted IPs used for location-based routing and dynamic emergency calling.

### Lifecycle & Governance

- **Team creation governance** — Restrict who can create teams/M365 groups via Entra group-creation policy (security-group gating); group naming policy (prefix/suffix, blocked words) applies to team names.
- **Microsoft 365 group expiration policy** — (Entra ID P1) Auto-expire inactive teams after 180/365/custom (≥30) days; owners get renewal notifications; teams with activity auto-renew; expired groups soft-delete with a 30-day restore window.
- **Team archiving** — Archive a team (TAC, team owner UI, or Graph), making channel conversations and optionally the SharePoint site read-only; archived teams can be reactivated any time and still count against expiration unless renewed.
- **Soft delete & restore** — Deleted teams/groups are restorable for 30 days with full content (mailbox, site, channels).
- **Org-wide teams** — Auto-membership teams including everyone in the org (limit up to 10,000 members; creation restricted to global admins/permitted users via `AllowOrgWideTeamCreation`); membership stays in sync automatically as people join/leave the org.
- **End-of-lifecycle options** — Documented paths for keeping, archiving, or deleting groups/teams and their associated services (site, mailbox, Planner) at project end.
- **Access reviews** — (Entra ID P2) Periodic recertification of team/group membership, including guests.

### Multi-Geo & Data Residency

- **Data-at-rest residency** — Teams data stored in the tenant's home geography; admins can see data location in the M365 admin center (Settings > Org settings > Organization profile > Data location).
- **Microsoft 365 Multi-Geo for Teams** — (Multi-Geo add-on license) Store Teams core customer data (chat/channel messages, team/channel structure) in chosen satellite geos per user via the Preferred Data Location (PDL) Entra attribute; team data location follows the group PDL; single-tenant administration is retained with full cross-geo collaboration.
- **Migration between geos** — Changing PDL queues migration of the user's Teams chat data to the new geo.

### Government Clouds (GCC / GCC High / DoD)

- **Dedicated sovereign environments** — Teams available in GCC (FedRAMP High, screened-US-personnel support), GCC High (DFARS/ITAR/CMMC alignment), and DoD (IL5) with compliance-driven feature restrictions.
- **App ecosystem differences** — Third-party apps off by default in GCC and unavailable in GCC High/DoD; GCC High supports Incoming Webhooks only; custom line-of-business apps are supported.
- **Calling differences** — Calling Plans and some Teams Phone options are limited; GCC High historically Direct Routing-only for PSTN; audio conferencing options differ per cloud.
- **Feature lag and gaps** — New commercial features roll out later (or never) to gov clouds; some Purview/Defender capabilities have reduced functionality in GCC High/DoD.
- **Tenant isolation for sharing** — GCC High/DoD users can generally only share/federate with other tenants in the same cloud.
- **Gov policy packages** — Dedicated Teams policy packages published for government cloud tenants.

### SLA & Trust

- **Financially backed 99.9% Microsoft 365 SLA** — Core Teams service covered by the Microsoft 365 uptime SLA with service credits (25/50/100%) on missed months.
- **99.999% Teams Phone SLA** — Effective April 2024, Calling Plans, Teams Phone, and PSTN audio conferencing carry a financially backed 99.999% uptime SLA (raised from 99.99% set in 2021), with per-user, per-minute-of-impact credit calculation up to 100% monthly credit.
- **Compliance certifications** — Teams is Tier-D compliant: ISO 27001, ISO 27018, SSAE 18 SOC 1/SOC 2, HIPAA BAA, EU Model Clauses, FedRAMP, plus Cloud Security Alliance support.
- **Privacy commitments** — No advertising use of customer data; customer data stays in the tenant; Microsoft Trust Center commitments apply to Teams; content search/eDiscovery work without enablement steps.

### Desktop Client (Windows/Mac) — "New Teams" Architecture

- **WebView2-based client (replaced Electron)** — The new Teams client is built on Microsoft Edge WebView2 (Evergreen), sharing browser resources with Edge so the client always runs the latest Chromium fixes without shipping its own browser runtime.
- **React + Fluent UI front end** — UX layer standardized on ReactJS, TypeScript, and Fluent UI, replacing AngularJS from classic Teams.
- **Client data layer on parallel threads** — Data fetch, storage, compliance operations, push notifications, and offline functionality run off the main UI thread (via a GraphQL-abstracted data layer and IPC), measurably improving UI responsiveness under load.
- **Optimized video rendering pipeline** — Rebuilt API surface reduced IPC calls 40x when loading a 7x7 video meeting stage; ~10% faster video load at P95 and up to 36% fewer video freezes/rendering failures.
- **Performance gains vs classic Teams** — Installs up to 3x faster (MSIX packaging), launches up to 2x faster, joins meetings up to 2x faster, switches chats/channels up to 1.7x faster, uses up to 50% less memory, and up to 70% less disk because WebView2 shares binaries with Edge.
- **MSIX-based Windows installer** — 64-bit and 32-bit installers deployable via Intune/MDM, Group Policy + PowerShell, Configuration Manager, and bundled by default with Microsoft 365 Apps for enterprise; a Teams preinstallation script is provided for image-based deployment.
- **macOS universal installer** — Single universal binary supports both Intel and Apple Silicon Macs.
- **No Linux desktop client** — Teams is no longer supported as a native Linux app; Linux users use Teams for Web (Chrome/Edge/Firefox).
- **Evergreen auto-update servicing** — Teams updates automatically in the background under the Modern Lifecycle Policy; an in-app alert appears if the client is 1–3 months out of date; admins manage update behavior via update rings/policies, Group Policy, and the Microsoft 365 Apps admin center.
- **Teams client health dashboard** — Teams admin center dashboard for monitoring client versions and update compliance across the org.
- **Built-in diagnostics** — Client diagnostic log collection and diagnostic logging tools for admin troubleshooting.
- **Pop-out windows** — Chats, channel content, and meetings can be popped out into separate windows (a desktop-only capability not offered in the web client).

### Multi-Account / Multi-Tenant Sign-in (MTMA)

- **Multiple work/school accounts signed in simultaneously** — New Teams desktop lets users add multiple work/school accounts (and guest access to other orgs) via profile picture > "Add another account," without separate browser profiles.
- **Cross-account real-time notifications** — Notifications arrive from all signed-in accounts and all associated organizations regardless of which account/tenant is currently in focus.
- **Cross-tenant participation without dropping calls** — Users can join chats, meetings, and calls in another account/org without leaving an ongoing call or meeting in the current one.
- **Per-account status/presence** — Status can be set independently for each account and organization.
- **Multi-Tenant Organization (MTO) capabilities** — For orgs configured as an MTO in Microsoft 365, users can join meetings/chats/channels hosted in another tenant while composing messages in their own; unified people search returns a single deduplicated result per person across tenants. Available on Windows, macOS, iOS, and Android clients.

### Web Client

- **Browser support** — Teams for Web runs on Microsoft Edge, Chrome, Firefox (latest three versions, on Windows/macOS/Linux), and Safari (latest two versions, macOS); browsers must run on a desktop/laptop.
- **Near feature parity with desktop** — The new Teams web client offers near feature parity with the new desktop client for chat, channels, and meetings.
- **Web-specific limitations** — No simultaneous multi-account availability/notifications and no pop-out windows for chat/channel content; PWA installation is not supported on Firefox (and Safari PWA support has been curtailed).
- **No-install meeting join** — Anonymous/guest participants can join meetings directly from a browser without installing the client.

### Mobile Apps (iOS/Android) — Mobile-Specific Features

- **Companion mode for Teams Rooms** — Phone acts as a second screen in a room meeting: one tap joins both the phone and the Teams Room, phone audio is auto-muted to prevent echo, and the phone surface is optimized for raise hand, reactions, chat, and viewing participants (iOS and Android).
- **Apple CarPlay integration** — Join Teams audio calls/meetings from CarPlay with visible mute state and raise-hand control; Siri can respond to notifications, send chat/channel messages, and join meetings hands-free.
- **iPadOS multi-window** — Teams on iPad supports Split View, Slide Over, and center-window multitasking.
- **Mobile live caption customization** — Users can customize caption font color, background color, and caption height on mobile for readability.
- **Screen capture prevention (iOS)** — Blocks screenshots/recording of sensitive meeting content on iOS devices.
- **Impersonation-risk meeting alerts** — Teams mobile can warn users when potential impersonation risks are detected during meetings (iOS and Android).
- **In-context agent/app store on mobile** — Users can find and install agents/apps from the mobile in-context store or via @mentions in the compose box.
- **Voice isolation** — AI-based filtering of background noise so only the user's voice transmits on mobile calls/meetings; the cleaned audio signal also benefits hearing-impaired listeners.
- **Notification position customization** — Desktop-companion feature set includes selectable notification corner; mobile push notifications cover all signed-in accounts/tenants.
- **Parent Connection in mobile app** — Education parents/guardians access student progress via the Teams mobile app (see Education section).
- **Frontline tailored mobile home** — A simplified, role-tailored home experience surfacing Shifts, Tasks, and Walkie Talkie for frontline workers.

### VDI Support

- **New VDI solution ("VDI 2.0") on SlimCore** — Replaces WebRTC-based optimization; SlimCore is the same media engine as the physical desktop client, delivered as a lightweight MSIX package that runs on the local endpoint and processes audio/video locally.
- **Endpoint GPU acceleration and QoS** — SlimCore uses the endpoint's local GPU for hardware-accelerated encode/decode and tags packets with DSCP markings for QoS.
- **Evergreen, infrastructure-decoupled media stack** — Media stack updates independently of the VDI broker/agent, avoiding version mismatches between client and media components.
- **Certified platforms** — AV optimization certified with Azure Virtual Desktop, Windows 365, Citrix, Omnissa (VMware Horizon), and Amazon WorkSpaces; also works with published apps (RemoteApp, Citrix Virtual Apps, Windows 365 Cloud Apps).
- **macOS endpoint support** — SlimCore-based optimization extends to macOS endpoints on Citrix and AVD/Windows 365.
- **WebRTC optimization retirement** — Legacy WebRTC path unsupported after October 1, 2026 for Windows endpoints (Microsoft + Citrix).
- **VDI Best Practice Configurations dashboard** — Teams admin center dashboard (early 2026) flags users/locations running unoptimized or legacy VDI configurations.

### Plans: Teams Free vs Essentials vs Microsoft 365

- **Teams Free** — 60-minute group meeting cap, 100 participants, unlimited chat, 5 GB cloud storage, screen sharing, background effects; unlimited-duration 1:1 calls; no audio dial-in; limits follow the organizer's license.
- **Teams Essentials ($4/user/mo)** — Standalone Teams without Microsoft 365: 30-hour meetings, 300 participants, meeting recordings with transcripts and live captions (English), 10 GB storage per user, guest access, unlimited chat/file attachments/search, and real-time collaboration with file sharing, tasks, and polling.
- **Microsoft 365 Business Basic** — Adds Exchange email with custom domain, SharePoint, 1 TB OneDrive per user, web/mobile Office apps, Forms and Lists, live captions in 30+ languages, Whiteboard with collaborative annotations, and breakout rooms.
- **Microsoft 365 Business Standard** — Adds desktop Office apps (Word/Excel/PowerPoint/Outlook/OneNote), Loop, Clipchamp, and webinar hosting.
- **Microsoft 365 Business Premium** — Adds Intune device management, conditional access, data loss prevention, and advanced threat protection.
- **Common to all plans** — Chat/call/video conferencing, data encryption for meetings/chats/calls/files, guest access, screen sharing, custom backgrounds, Together mode, and immersive spaces.
- **Teams Premium add-on (separate license)** — Gates advanced meeting features referenced across areas (e.g., live translated captions, meeting watermarks/advanced protection, custom Together modes); required on top of an M365 plan.

### Teams for Education — Class Teams and Teaching Tools

- **Class Teams team type** — Purpose-built team template with educator/student roles, class materials folder, and integrated Assignments/Grades/Insights tabs; other education team types include Staff, PLC, and Other.
- **Assignments** — Create, distribute, collect, and grade classwork with due dates, scheduled assignment, attachments (files, links, Class Notebook pages), and per-student or group assignment; admin-manageable via the Assignments service (Education SKUs only).
- **Grading rubrics** — Educators create reusable multi-criteria rubrics with proficiency levels, score each criterion inline, and can AI-generate a rubric from a description plus a standard chosen from a built-in standards library.
- **Grades tab and grading schemes** — Central gradebook per class; supports alternative grading schemes (points, letter grades, custom) and grade return/resubmission workflows.
- **Classwork** — Organize class resources into modules mixing Assignments, OneNote Class Notebook pages, links, files, and channels.
- **Reading Progress** — Learning Accelerator (free in Teams EDU) where students record themselves reading; auto-detects accuracy rate, mispronunciations, words-per-minute, and most-challenging words, with Reading Coach practice.
- **Speaker Progress / Speaker Coach** — Students practice presentations and get AI coaching on pace, pitch, filler words, pronunciation, repetitive language, sensitive phrases, eye contact, and body language.
- **Search Coach / Search Progress** — Teaches query composition and source evaluation; Search Progress lets educators assign research tasks and see students' source collection and annotations.
- **Reflect** — Wellbeing check-in app for classes; students share feelings via emotion check-ins that feed educator dashboards.
- **Education Insights** — Real-time analytics on student engagement (digital activity), assignment/grade trends, Reading Progress data, and Reflect check-ins; Insights Premium (A5/paid) extends to school-and-district level reporting.
- **OneNote Class Notebook** — Auto-provisioned per class team with a content library, collaboration space, and private per-student sections; integrated into Assignments for page distribution and grading.
- **Parent/School Connection** — Parents and guardians get digests and a Teams-mobile experience showing their student's assignments, classroom engagement, learning progress, and time management, plus a teacher directory and chat with educators.
- **School Data Sync (SDS)** — Syncs rosters from an SIS/LMS to auto-create and maintain class teams at scale.
- **LMS integration (Microsoft 365 LTI)** — Brings Teams meetings, Teams classes, Assignments/Learning Accelerators, OneDrive files, and Class Notebook into Canvas, Blackboard, Moodle, etc.; instructors can create a Team for a course from the LMS.
- **Education licensing** — Office 365/Microsoft 365 A1 (free, web-based) includes Teams with the education feature set; A3 adds desktop apps, management, and security; A5 adds advanced security, analytics (Insights Premium), and compliance; supported EDU languages are documented separately.

### Teams for Frontline Workers

- **Shifts (schedule management)** — Managers build schedules with custom groups, assigned shifts, breaks, and open shifts; workers set availability, view schedules, request time off, swap/offer shifts, and claim open shifts with manager approval flows.
- **Shifts Time Clock** — Clock in/out and break tracking from Teams, with optional location-based (geofenced) clock-in restriction and manager-visible time reports.
- **Shifts WFM connectors** — Real-time bi-directional connectors for UKG Pro WFM (Kronos/Dimensions), Blue Yonder, and Reflexis sync schedules between Shifts and the WFM system; the Microsoft Graph Shifts API and Power Automate connectors support custom integrations.
- **Deploy Shifts at scale** — Admins can standardize and centrally manage Shifts settings across all frontline teams.
- **Walkie Talkie** — Push-to-talk over Wi-Fi/cellular turning phones/tablets into radios; users can pin up to five channels on the Walkie Talkie home screen; works with certified PTT-button devices and headsets.
- **Tasks in Teams (Planner)** — Personal and team task management with frontline-tailored task lists on mobile.
- **Task publishing** — Corporate/regional teams author task lists and publish them to targeted location teams via the frontline operational hierarchy; recipient managers assign tasks locally and HQ tracks completion status across locations.
- **Frontline operational hierarchy** — Admin-defined mapping of org structure (regions/locations) in Teams admin center that powers task publishing and targeting.
- **Targeted communications / Announcements** — Corporate communicators target urgent announcements, role-specific updates, and safety policy changes to frontline workers via Viva Connections, delivered as push notifications and in the Teams home experience; shift-based tags let messages reach only employees currently on shift.
- **Tailored frontline home experience** — App setup policies pin Shifts, Tasks, Walkie Talkie, and Approvals for frontline roles; Teams policy packages for frontline workers streamline policy assignment.
- **Dynamic/static frontline teams at scale** — Bulk deployment of location teams with dynamic (rule-based) or static membership.
- **Approvals, Lists, Updates** — Digitize paper processes (approvals, inspections, store walks) inside Teams; extendable with Power Apps/Power Automate/Power BI (Power Platform features on F3 but not F1).
- **Frontline Agent (AI)** — Copilot-based agent that summarizes key updates and action items at shift start, drafts end-of-shift handovers, and answers questions from SharePoint/Teams content; rolling out via Microsoft 365 Copilot licensing.
- **AI-powered translation for frontline** — Real-time translated communication across locations and languages cited as a frontline capability (Copilot/AI-gated).
- **Frontline licensing** — Microsoft 365 F1 and F3 are the frontline SKUs (E3/E5 also work); F3 includes Power Apps/Power Automate which F1 lacks; shared-device sign-in/sign-out modes and Intune frontline device management support shared and BYOD devices.

### Accessibility

- **Live captions** — Real-time captions in meetings/calls with speaker attribution; caption appearance (font color, background, height/position) is customizable; translated live captions require Teams Premium.
- **Live transcription** — Running transcript with speaker names during meetings, available afterward alongside recordings.
- **CART captioning support** — Meetings can embed Communication Access Realtime Translation (human captioner) streams for accurate live captions.
- **Sign Language View** — Keeps designated signers/interpreters in a consistent, prioritized on-screen position throughout meetings (Windows, Mac, web).
- **Real-Time Text (RTT)** — Instant character-by-character text transmission during calls as an accessibility feature, including on iOS and Android.
- **TTY mode** — Teletypewriter support toggle (Settings > Accessibility / Calls) translating voice calls to text via a physical TTY device connected to the computer (desktop client only; serial-to-USB adapter typically needed).
- **Screen reader support** — Compatible with Windows Narrator, JAWS, and other major screen readers, with dedicated screen-reader documentation and full keyboard navigation/shortcuts.
- **High contrast mode** — Honors OS high-contrast/color-filter settings for improved text and control visibility.
- **Magnification** — Works with OS magnifier tools (full screen or lens) for low-vision users.
- **Immersive Reader** — Reads chat/channel messages and assignments aloud with synchronized highlighting; includes speed/voice controls, Line Focus (1/3/5 lines), Parts of Speech grammar tools, Picture Dictionary, and inline translation; available on desktop, web, and mobile.
- **Background effects for cognitive accessibility** — Blur or custom backgrounds reduce visual distraction (not available in VDI on Mac per support docs).
- **Meeting recording for accessibility** — Recordings retained in chat history let users review content at their own pace.
- **Voice isolation and noise suppression** — AI filtering benefits hearing-impaired listeners by cleaning the audio signal.
- **Pin/spotlight interpreters** — Participants can pin or multi-pin sign language interpreters; organizers can spotlight them for everyone.
- **Disability Answer Desk** — Dedicated Microsoft support channel for accessibility issues in Teams.

### Offline Behavior

- **Offline browsing** — Users can browse chats and channels accessed in the last 30 days, plus pinned conversations, while disconnected.
- **Offline compose and 24-hour send queue** — Messages composed offline queue for up to 24 hours and send automatically on reconnect; queued messages can be edited before they send.
- **Connection-state indicator** — Client surfaces offline/limited-connectivity banners; presence shows offline when disconnected.
- **No full offline mode** — Document co-authoring and most collaboration features require connectivity; Teams has no Outlook-style complete offline cache.

### Localization / Languages

- **App language setting** — Client follows OS language by default with a toggle to manually set app language, date format, and time format.
- **Broad UI localization** — Client UI localized into several dozen languages (including English, Arabic, Bengali, Bulgarian, Catalan, Croatian, Czech, Danish, Dutch, Estonian, Filipino, Finnish, French, German, Greek, Gujarati, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Italian, Japanese, Kannada, Korean, Latvian, Lithuanian, Malayalam, and more); unsupported locales fall back to a related language or English.
- **Feature-specific language matrices** — Separate supported-language lists exist for live captions (30+ languages on M365 plans), multilingual speech recognition, Audio Conferencing prompts, auto attendant/call queue prompts, and voicemail greetings.
- **Inline message translation** — Chat/channel messages can be translated inline; Immersive Reader translates by word or full document.
- **Live interpreter feature** — Language interpretation (human interpreters on separate audio channels) is available across desktop and mobile (iOS, Android).
