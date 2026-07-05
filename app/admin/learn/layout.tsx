import '../styles/AdminLearn.css';
import '../styles/AdminArticle.css';
// KaTeX styles — required for the math rendered across the Learn area (AI
// tutor, lessons, FS/SIT modules, articles, practice problems). Scoped to
// /admin/learn/** by living in this segment's layout.
import 'katex/dist/katex.min.css';

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
