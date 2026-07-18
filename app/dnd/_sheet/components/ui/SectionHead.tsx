import OptionsMark from './OptionsMark'

// `optionsTip` — when a section's behavior is governed by a preference, pass a short explanation and the
// header shows the ⚙ options mark so the reader knows settings exist for it.
export default function SectionHead({ num, title, optionsTip }: { num: string; title: string; optionsTip?: string }) {
  return (
    <div className="sec-head">
      <span className="sec-num">{num} {'//'}</span>
      <h2>{title}{optionsTip && <OptionsMark tip={optionsTip} />}</h2>
    </div>
  )
}
