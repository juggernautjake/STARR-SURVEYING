// app/admin/jobs/new/page.tsx — Create new job
'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import Link from 'next/link';
import UnderConstruction from '../../components/messaging/UnderConstruction';
import { SURVEY_TYPES } from '../../components/jobs/JobCard';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import Tooltip from '../../research/components/Tooltip';

export default function NewJobPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { safeFetch, safeAction, reportPageError } = usePageError('NewJobPage');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    survey_type: 'boundary',
    address: '',
    city: '',
    state: 'TX',
    zip: '',
    county: '',
    acreage: '',
    lot_number: '',
    subdivision: '',
    abstract_number: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    client_company: '',
    client_address: '',
    lead_rpls_email: '',
    deadline: '',
    quote_amount: '',
    notes: '',
    tags: '',
    is_priority: false,
    is_legacy: false,
    stage: 'quote',
  });

  function updateField(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleAddressSelect(details: { address: string; city: string; county: string; state: string; zip: string }) {
    setForm(prev => ({
      ...prev,
      address: details.address || prev.address,
      city: details.city || prev.city,
      county: details.county || prev.county,
      state: details.state || prev.state,
      zip: details.zip || prev.zip,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { setError('Job name is required'); return; }
    setSaving(true);
    setError('');

    try {
      const body = {
        ...form,
        acreage: form.acreage ? parseFloat(form.acreage) : undefined,
        quote_amount: form.quote_amount ? parseFloat(form.quote_amount) : undefined,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        deadline: form.deadline || undefined,
      };

      const res = await fetch('/api/admin/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/admin/jobs/${data.job.id}`);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create job');
      }
    } catch (err) {
      setError('Network error');
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'create job' });
    }
    setSaving(false);
  }

  if (!session?.user) return null;

  return (
    <>
      <UnderConstruction
        feature="New Job"
        description="Create a new survey job and start the quote-to-delivery lifecycle."
      />

      <div className="job-form">
        <div className="job-form__header">
          <Link href="/admin/jobs" className="learn__back">&larr; Back to Jobs</Link>
          <h2 className="job-form__title">Create New Job</h2>
        </div>

        {error && <div className="job-form__error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Job Info */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Job Information</h3>
            <div className="job-form__grid">
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Job Name *
                    <Tooltip text="A descriptive name for this survey job. Typically includes the client's last name and the type of survey (e.g., 'Smith Boundary Survey' or 'Johnson ALTA/NSPS'). This will appear on all reports and invoices." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="e.g., Smith Boundary Survey" required />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Survey Type
                    <Tooltip text="The category of survey work to be performed. This determines which checklist templates are loaded and affects how the job is organized in pipeline views. Common types: Boundary (property lines), ALTA/NSPS (title insurance), Topographic (elevation/contours), Construction (staking/layout)." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <select className="job-form__select" value={form.survey_type} onChange={e => updateField('survey_type', e.target.value)}>
                  {Object.entries(SURVEY_TYPES).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Initial Stage
                    <Tooltip text="The starting workflow stage for this job. Most new jobs start at 'Quote' and progress through: Quote (pricing) → Research (deed/plat review) → Field Work (data collection) → Drawing (plat creation) → Legal (review/signing) → Delivery (client handoff). Choose a later stage if work has already begun." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <select className="job-form__select" value={form.stage} onChange={e => updateField('stage', e.target.value)}>
                  <option value="quote">Quote</option>
                  <option value="research">Research</option>
                  <option value="fieldwork">Field Work</option>
                  <option value="drawing">Drawing</option>
                  <option value="legal">Legal</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Acreage
                    <Tooltip text="The approximate size of the property in acres. This helps estimate field time and affects pricing. Can be a decimal (e.g., 2.75 acres). For lots measured in square feet, divide by 43,560 to convert to acres." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" type="number" step="0.01" value={form.acreage} onChange={e => updateField('acreage', e.target.value)} placeholder="e.g., 5.25" />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Deadline
                    <Tooltip text="The target completion date for the entire job. This is used for scheduling and appears on the job dashboard as a countdown. Leave blank if no specific deadline has been agreed upon with the client." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" type="date" value={form.deadline} onChange={e => updateField('deadline', e.target.value)} />
              </div>
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Description
                    <Tooltip text="A detailed scope of work for this job. Include special requirements, access instructions, known issues (e.g., disputed boundaries, encroachments), and any specific deliverables the client expects. This is visible to all team members assigned to the job." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <textarea className="job-form__textarea" value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Job description and scope of work..." rows={3} />
              </div>
            </div>
          </div>

          {/* Property Info */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Property Information</h3>
            <div className="job-form__grid">
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Address
                    <Tooltip text="Start typing to see address suggestions. Selecting a suggestion will automatically fill in the city, county, state, and ZIP fields. You can also enter the address manually." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={val => updateField('address', val)}
                  onSelect={handleAddressSelect}
                  className="job-form__input"
                  placeholder="Start typing an address..."
                  biasTexas={true}
                />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    City
                    <Tooltip text="The city or town where the property is located. This is auto-filled when selecting from address suggestions but can be edited manually." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" value={form.city} onChange={e => updateField('city', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">State</label>
                <input className="job-form__input" value={form.state} onChange={e => updateField('state', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">ZIP</label>
                <input className="job-form__input" value={form.zip} onChange={e => updateField('zip', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    County
                    <Tooltip text="The county where the property is located. This is critical for research — deed records, plat maps, and appraisal data are organized by county. Auto-filled when using address suggestions, or enter manually." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" value={form.county} onChange={e => updateField('county', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Lot Number
                    <Tooltip text="The lot number as recorded in the subdivision plat. Found on the recorded plat map at the county clerk's office (e.g., 'Lot 5' or 'Lot 12, Block 3'). Leave blank if the property is not part of a subdivision." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" value={form.lot_number} onChange={e => updateField('lot_number', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Subdivision
                    <Tooltip text="The name of the recorded subdivision or addition. This is the platted development name as it appears on county records (e.g., 'Oak Hills Estates Phase II' or 'Martin Addition'). Used to locate recorded plats and deed restrictions." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" value={form.subdivision} onChange={e => updateField('subdivision', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Abstract Number
                    <Tooltip text="The Texas General Land Office (GLO) abstract number that identifies the original land grant or survey. This is a key identifier for researching property history in Texas — it links to the original patent, field notes, and chain of title. Found on appraisal district records or the deed (e.g., 'Abstract 42, H.H. Smith Survey')." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" value={form.abstract_number} onChange={e => updateField('abstract_number', e.target.value)} placeholder="e.g., Abstract 42" />
              </div>
            </div>
          </div>

          {/* Client Info */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Client Information</h3>
            <div className="job-form__grid">
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Client Name
                    <Tooltip text="The name of the person or entity requesting the survey. This will appear on the survey plat, invoice, and all correspondence. For companies, enter the company name; for individuals, enter their full legal name." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" value={form.client_name} onChange={e => updateField('client_name', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Client Email
                    <Tooltip text="Primary email address for the client. Used for sending quotes, deliverables, and status updates. If the client contact is different from the property owner, enter the contact person's email." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" type="email" value={form.client_email} onChange={e => updateField('client_email', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Client Phone</label>
                <input className="job-form__input" type="tel" value={form.client_phone} onChange={e => updateField('client_phone', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Company
                    <Tooltip text="The client's company or organization name, if applicable. Common for title companies, real estate firms, and engineering companies that regularly order surveys." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" value={form.client_company} onChange={e => updateField('client_company', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Assignment & Financial */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Assignment & Financial</h3>
            <div className="job-form__grid">
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Lead RPLS Email
                    <Tooltip text="The email address of the Registered Professional Land Surveyor (RPLS) who will be responsible for this job. The lead RPLS reviews all work, signs and seals the final plat, and is professionally liable for the survey. Must be a licensed Texas RPLS." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" type="email" value={form.lead_rpls_email} onChange={e => updateField('lead_rpls_email', e.target.value)} placeholder="rpls@starr-surveying.com" />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Quote Amount ($)
                    <Tooltip text="The estimated or agreed-upon price for this survey job in US dollars. This appears on the financial dashboard and is used to calculate revenue projections. Can be updated later as the scope changes." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" type="number" step="0.01" value={form.quote_amount} onChange={e => updateField('quote_amount', e.target.value)} placeholder="0.00" />
              </div>
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Tags (comma-separated)
                    <Tooltip text="Custom labels for organizing and filtering jobs. Use tags to categorize jobs by type, client, terrain, or urgency. Examples: 'residential', 'rush', 'complex terrain', 'title company', 'repeat client'. Jobs can be filtered by tag on the main jobs dashboard." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input className="job-form__input" value={form.tags} onChange={e => updateField('tags', e.target.value)} placeholder="residential, rush, complex terrain" />
              </div>
            </div>
          </div>

          {/* Notes & Flags */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Notes & Flags</h3>
            <div className="job-form__grid">
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">
                  <span className="job-form__label-row">
                    Notes
                    <Tooltip text="Internal notes about this job. These are visible to all team members but not shared with the client. Use for special instructions, access gate codes, contact details for property owners, known hazards, or coordination notes between field and office staff." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <textarea className="job-form__textarea" value={form.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Any additional notes..." rows={3} />
              </div>
              <div className="job-form__field">
                <Tooltip text="Mark this job as high priority. Priority jobs are highlighted with a red indicator throughout the system, appear at the top of lists, and should be scheduled and completed before standard jobs. Use for rush orders, time-sensitive closings, or construction deadlines that cannot be missed." position="bottom">
                  <label className="job-form__checkbox-label">
                    <input type="checkbox" checked={form.is_priority} onChange={e => updateField('is_priority', e.target.checked)} />
                    Priority Job
                  </label>
                </Tooltip>
              </div>
              <div className="job-form__field">
                <Tooltip text="Mark this as a legacy or historical job being imported from a previous system or paper records. Legacy jobs represent completed work from before this system was in use. They are tagged differently in reports to distinguish historical data from current work. Useful for maintaining a complete project history and referencing past surveys when new work overlaps." position="bottom">
                  <label className="job-form__checkbox-label">
                    <input type="checkbox" checked={form.is_legacy} onChange={e => updateField('is_legacy', e.target.checked)} />
                    Legacy/Historical Job
                  </label>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="job-form__actions">
            <Link href="/admin/jobs" className="job-form__cancel">Cancel</Link>
            <button type="submit" className="job-form__submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
