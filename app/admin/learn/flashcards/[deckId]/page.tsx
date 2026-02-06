// app/admin/learn/flashcards/[deckId]/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import FlashcardViewer from '@/app/admin/components/FlashcardViewer';
import { Suspense } from 'react';

interface Card { id: string; term: string; definition: string; hints: string[]; linked_keywords: string[]; linked_module_id?: string; linked_lesson_id?: string; }

function DeckContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const deckName = decodeURIComponent(params.deckId as string);
  const type = searchParams.get('type') || 'builtin';
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/learn/flashcards?deck=${encodeURIComponent(deckName)}&type=${type}`)
      .then(r => r.json()).then(d => {
        // Shuffle cards
        const shuffled = (d.cards || []).sort(() => Math.random() - 0.5);
        setCards(shuffled);
      }).catch(() => {}).finally(() => setLoading(false));
  }, [deckName, type]);

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Loading cards...</div></div>;

  return <FlashcardViewer cards={cards} deckName={deckName} onBack={() => router.push('/admin/learn/flashcards')} />;
}

export default function DeckStudyPage() {
  return <Suspense fallback={<div className="admin-empty"><div className="admin-empty__icon">⏳</div></div>}><DeckContent /></Suspense>;
}
