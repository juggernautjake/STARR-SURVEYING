# Extracted projects

On 2026-10-24 two side projects were moved out of this repo so the surveying platform contains only surveying. They now live in the private repo `juggernautjake/dnd-voice-studio` (local: `C:\Users\Jacob Maddux\dev\dnd-voice-studio`), at the same relative paths. Source commit: `f27477eacb8e8adbb56aadbadd95af3f2206c893`.

| Project | Was at | Size |
| --- | --- | --- |
| D&D tabletop platform | `app/dnd`, `app/api/dnd`, `lib/dnd`, `__tests__/dnd`, `public/dnd`, `app/api/cron/dnd-session-reminders`, D&D plans in `docs/planning`, `docs/reference/intuitive-games` | 35 pages, 146 routes (incl. the cron), 332 lib files |
| Voice studio | `app/AndrewAsh`, `app/api/voice`, `lib/voice`, `__tests__/voice`, `public/AndrewAsh`, `public/andrew` | 30 pages, 26 routes, 23 lib files |

The phone receptionist (`lib/receptionist`, `app/api/elevenlabs`, `app/api/twilio`) is surveying and stays. The "AI tutor" docs and code are the FS learning tutor and also stay.

## What changed here

Removed with the code: the `/dnd` middleware gate and matcher entry, the layout-shell exceptions for `/dnd` and `/AndrewAsh`, the `dnd-session-reminders` cron in `vercel.json`, the service-worker headers for the two scoped PWAs in `next.config.js`, the `dnd:*` and `migrate:dnd-content` npm scripts, the D&D and voice entries in the route-auth, assumptions and design-catalogue scripts, the page-inventory entries, and the tests that covered the moved code. The `@dnd-kit/*` packages stay: the hub widget editor uses them (drag and drop, not D&D). Dependencies and the lockfile were not pruned.

## Database: left in place on purpose

Nothing was dropped and no migration history changed. The tables are still in Supabase so they can be moved to a new project, or dropped later on purpose.

**D&D tables (created by the moved seeds):** `dnd_campaign_characters`, `dnd_campaign_members`, `dnd_campaigns`, `dnd_character_uploads`, `dnd_characters`, `dnd_content`, `dnd_creature_variants`, `dnd_creatures`, `dnd_encounters`, `dnd_handouts`, `dnd_homebrew`, `dnd_initiative_entries`, `dnd_invites`, `dnd_map_discoveries`, `dnd_map_edits`, `dnd_map_nodes`, `dnd_map_objects`, `dnd_map_pins`, `dnd_map_triggers`, `dnd_maps`, `dnd_media`, `dnd_messages`, `dnd_rate_limits`, `dnd_recaps`, `dnd_roll_log`, `dnd_session_rsvps`, `dnd_sessions`, `dnd_sheet_edits`, `dnd_soundboard_tabs`, `dnd_sounds`, `dnd_storage_objects`, `dnd_stream_aliases`, `dnd_stream_messages`, `dnd_stream_polls`, `dnd_stream_replies`, `dnd_stream_state`, `dnd_suggestions`, `dnd_system_entries`, `dnd_systems`, `dnd_users`. `dnd_rate_limits` was renamed to `rate_limits` by Starr seed 502, which stays in Starr because the rate limiter is shared.

**Voice-studio tables:** `va_clients`, `va_coaching_packages`, `va_coaching_sessions`, `va_coaching_students`, `va_contracts`, `va_credits`, `va_demos`, `va_documents`, `va_expenses`, `va_inquiries`, `va_invoices`, `va_media`, `va_notification_prefs`, `va_notifications`, `va_page_revisions`, `va_pages`, `va_payments`, `va_push_subscriptions`, `va_settings`, `va_subscriptions`, `va_testimonials`, `va_users`. `va_push_subscriptions` is also touched by Starr seed 571 (admin push), which stays in Starr.

**Seeds moved to the new project (in Starr's `seeds/`, now removed):**
- `seeds/410_dnd_schema.sql`
- `seeds/411_dnd_storage.sql`
- `seeds/412_dnd_streamer_skin.sql`
- `seeds/413_dnd_directed_invites.sql`
- `seeds/414_dnd_stream_controls.sql`
- `seeds/415_dnd_claimable_characters.sql`
- `seeds/416_dnd_stream_donations.sql`
- `seeds/417_dnd_character_ownership.sql`
- `seeds/418_dnd_suggestions.sql`
- `seeds/419_dnd_stream_poll_direction.sql`
- `seeds/420_dnd_donata_dime.sql`
- `seeds/421_dnd_maps.sql`
- `seeds/422_dnd_systems.sql`
- `seeds/423_dnd_system_starter.sql`
- `seeds/424_dnd_build_mode.sql`
- `seeds/425_dnd_build_questions.sql`
- `seeds/441_dnd_custom_sheet.sql`
- `seeds/442_dnd_system_variants.sql`
- `seeds/443_dnd_custom_approval.sql`
- `seeds/444_dnd_rage_field_migration.sql`
- `seeds/445_dnd_more_systems.sql`
- `seeds/446_dnd_character_systems.sql`
- `seeds/447_dnd_campaign_system.sql`
- `seeds/448_dnd_roster_role.sql`
- `seeds/449_dnd_suggestion_status.sql`
- `seeds/450_dnd_sheet_edit_batches.sql`
- `seeds/454_dnd_media_publish_flag.sql`
- `seeds/455_dnd_homebrew.sql`
- `seeds/456_dnd_rate_limits.sql`
- `seeds/457_dnd_campaign_visibility.sql`
- `seeds/458_dnd_account_recovery.sql`
- `seeds/459_dnd_storage_ledger.sql`
- `seeds/460_dnd_session_rsvps.sql`
- `seeds/461_dnd_discord_webhook.sql`
- `seeds/462_dnd_bestiary.sql`
- `seeds/463_dnd_sheet_edits_sources.sql`
- `seeds/464_dnd_bestiary_first_creatures.sql`
- `seeds/465_dnd_map_nodes.sql`
- `seeds/466_dnd_map_node_console_ref.sql`
- `seeds/467_dnd_creature_image_provenance.sql`
- `seeds/468_dnd_creatures_canonical.sql`
- `seeds/511_dnd_map_edits.sql`
- `seeds/512_dnd_map_fog.sql`
- `seeds/518_dnd_standalone_maps.sql`
- `seeds/538_voice_platform.sql`
- `seeds/539_voice_business_ops.sql`
- `seeds/540_voice_user_username.sql`
- `seeds/541_voice_payment_methods.sql`

**Seeds that stay in Starr for migration history:** `451_campaign_character_override.sql`, `453_characters_public_by_default.sql` (alter D&D tables, but mixed with history that must not change), `502_rate_limits.sql`, `571_admin_push_subscriptions.sql`, `668_revoke_public_security_definer_rpcs.sql`. Copies of 451 and 453 are also in the new project's `seeds/`.

Storage buckets used by D&D (not created by SQL here): `dnd-media`.

Caveat for a fresh database: Starr's `seeds/run_all.sh` no longer creates the D&D or voice tables. Seeds 451 and 453 alter D&D tables and stay here for history, so on an empty database they would need the new project's seeds applied first (or be skipped). The live database is unaffected.

## Drop checklist (when the owner decides)

1. Decide whether the new project gets its own Supabase project or shares this one.
2. Export the tables above and the `dnd-media` storage bucket first.
3. Then drop the tables in dependency order, and remove seeds 451 and 453 here.
4. Remove the `VOICE_*`, `DND_*` and `ANDREW_PHOTO_SRC` variables from the Vercel environment.
