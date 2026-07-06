export default function SectionHead({ num, title }: { num: string; title: string }) {
  return (
    <div className="sec-head">
      <span className="sec-num">{num} {'//'}</span>
      <h2>{title}</h2>
    </div>
  )
}
