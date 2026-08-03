// app/dnd/join/[code]/page.tsx — invite acceptance → account creation (Phase B, B4; named by P14-10b).
//
// THIS IS THE ONE SCREEN WHERE THE READER GENUINELY DOES NOT KNOW WHAT THEY ARE LOOKING AT. An invite
// arrives as a bare URL. Until P14-10b this page answered it with a hardcoded "Join Campaign" — no name,
// no blurb, no picture — and asked a stranger to choose a display name and a password for a table it
// would not identify. Every other campaign surface in the app names the campaign; this was the only one
// that did not, and it is the first one a new player ever sees.
//
// A SERVER component so the lookup happens before first paint: a client fetch would flash the unlabelled
// form first, which is the state this slice exists to remove.
//
// It still renders the form when the code resolves to nothing. `auth/register` is the only thing that
// judges a code, and a page that refused early would be a second gate that can disagree with the real
// one — and an oracle for guessing codes. See `loadInvitePreview`.
import { loadInvitePreview } from '@/lib/dnd/invite-preview';
import CampaignThumb from '@/app/dnd/_ui/CampaignThumb';
import styles from '@/app/dnd/_ui/hextech.module.css';
import JoinForm from './JoinForm';

export const dynamic = 'force-dynamic';

export default async function DndJoinPage({ params }: { params: { code: string } }) {
  const invite = await loadInvitePreview(params.code);
  const dead = invite?.used || invite?.expired;

  return (
    <div className={styles.root}>
      <div className={styles.screen}>
        <div className={styles.panel} style={{ display: 'grid', gap: 12 }}>
          <p className={styles.brand}>Starr Tabletop</p>

          {invite ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <CampaignThumb
                  campaignId={invite.campaignId}
                  name={invite.campaignName}
                  url={invite.thumbnailUrl}
                  size="row"
                  style={{ width: 58, height: 58 }}
                />
                <div style={{ minWidth: 0 }}>
                  <h1 className={styles.title} style={{ textAlign: 'left', margin: 0 }}>{invite.campaignName}</h1>
                  {invite.setting && (
                    <p className={styles.subtitle} style={{ textAlign: 'left', margin: '2px 0 0' }}>{invite.setting}</p>
                  )}
                </div>
              </div>
              <p className={styles.subtitle} style={{ margin: 0 }}>
                {invite.role === 'dm'
                  // A DM invite grants control of the table, which is a materially different thing to
                  // accept than a seat at it. Saying so is the difference between informed and not.
                  ? <>You have been invited to run this campaign as its <strong>Dungeon Master</strong>. Create your account to take it over.</>
                  : <>You have been invited to play. Create your account to take your seat at the table.</>}
              </p>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Join Campaign</h1>
              {/* No preview: either the code is unknown, or the lookup failed. Neither is stated as a
                  refusal here — `register` gives the real reason once a name is submitted, and claiming
                  "invalid invite" from a page that also fails this way on a database hiccup would be
                  wrong about as often as it was right. */}
              <p className={styles.subtitle}>Create your account to take your seat at the table</p>
            </>
          )}

          {/* Reported, never enforced — `auth/register` still decides. Saying it HERE is what stops
              someone choosing a name and a password and only then being told the invite was spent. */}
          {dead && (
            <div className={styles.error}>
              {invite?.used
                ? 'This invite has already been used. Ask your DM for a new link — or sign in below if the account is yours.'
                : 'This invite has expired. Ask your DM for a new link.'}
            </div>
          )}

          <JoinForm />
        </div>
      </div>
    </div>
  );
}
