import { PageHeader, Card } from '../components/ui.tsx';

export function CommunityScreen() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-nav pt-6">
      <PageHeader title="Community guidelines" subtitle="Keep the bridge kind" />
      <Card className="space-y-4 text-sm leading-relaxed text-ivory/80">
        <section>
          <h2 className="font-display text-2xl text-brass-300">A virtual bridge only</h2>
          <p>Love Locks is a digital tribute. Please never attach physical locks to real bridges, railings or monuments — the weight damages them and the real Pont des Arts had to remove its locks for that reason.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-brass-300">What belongs here</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Memories, promises, gratitude, jokes and puzzles made with care.</li>
            <li>Stories about yourself and the people you send them to.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-display text-2xl text-brass-300">What doesn’t</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Harassment, threats, hate or sexual content.</li>
            <li>Other people’s private information (addresses, phone numbers, documents).</li>
            <li>Spam, advertising or links in engravings and titles.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-display text-2xl text-brass-300">Safety tools</h2>
          <p>Report any lock from its page. Locks with several reports are hidden automatically until a moderator reviews them. You can block a creator to hide all of their locks, delete your own locks at any time, and delete your account (and everything in it) from Settings.</p>
          <p className="mt-2">We never ask for your location. Your email is never shown to other players. You can hide your name from your locks.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-brass-300">Age</h2>
          <p>Love Locks is intended for players aged 13 and over. If you are under the age of digital consent in your country, please ask a parent or guardian before creating an account.</p>
        </section>
      </Card>
    </main>
  );
}
