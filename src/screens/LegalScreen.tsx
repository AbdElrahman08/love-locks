// Privacy policy and terms of use. The text describes what the code actually does (see SECURITY.md and
// DATABASE.md). It is a DRAFT written without legal review: have it checked, set a contact email
// (VITE_CONTACT_EMAIL), then set LEGAL_DRAFT to false.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageHeader } from '../components/ui.tsx';

const LEGAL_DRAFT = true;
const UPDATED = '22 November 2026';
const CONTACT = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || '';

function Contact() {
  return CONTACT
    ? <a className="text-brass-300 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
    : <span className="text-rose-300">[contact email to be added before launch]</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-2xl text-brass-300">{title}</h2>
      {children}
    </section>
  );
}

function DraftNotice() {
  if (!LEGAL_DRAFT) return null;
  return (
    <p role="note" className="mb-4 rounded-2xl border border-brass-400/40 bg-brass-400/10 p-3 text-xs text-brass-300">
      Draft. This document has not yet been reviewed by a lawyer and may change before the public launch.
    </p>
  );
}

export function PrivacyScreen() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-nav pt-6">
      <PageHeader title="Privacy policy" subtitle={`Last updated ${UPDATED}`} />
      <DraftNotice />
      <Card className="space-y-6 text-sm leading-relaxed text-ivory/80">
        <p>
          Love Locks (“we”) runs a virtual bridge where you can hide stories inside locks. This policy explains what we
          store, why, and the choices you have. Questions: <Contact />.
        </p>

        <Section title="What we store">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b>Your profile:</b> a display name, an avatar emoji, your XP, achievements and settings. Guests get an automatic name such as “Wanderer #1234”.</li>
            <li><b>Account details (only if you register):</b> your email address and a password, which we store only as a salted, one-way hash. We cannot see your password.</li>
            <li><b>Your locks:</b> their appearance, title, category, visibility settings and the story you write.</li>
            <li><b>Puzzle answers:</b> stored only as salted one-way hashes, so we cannot read them either.</li>
            <li><b>Activity needed to run the game:</b> locks you opened, reactions, reports, blocks, daily challenge progress, and puzzle attempts (used to stop guessing attacks).</li>
            <li><b>Network data:</b> to limit abuse we keep a one-way hash of your IP address with each puzzle attempt, never the address itself.</li>
            <li><b>Usage events:</b> simple events such as “lock published” or “invitation opened”, stored on our own servers to understand how the game is used. They contain no story text and no third-party tracking.</li>
          </ul>
        </Section>

        <Section title="What we don’t collect">
          <p>No location data, no contacts, no camera or microphone, no advertising identifiers, and no third-party ad or tracking cookies.</p>
        </Section>

        <Section title="Who can see your story">
          <p>
            A story is shown only to people who solve its puzzle (and to you). The bridge and the Explore page show only a
            lock’s appearance, title and engraving. Your email is never shown to other players, and you can hide your name
            from your locks in Settings. Anyone holding one of your invitation links can try your puzzle, so share links privately.
          </p>
        </Section>

        <Section title="Why we use your data">
          <p>To run the game (create, show and open locks), to keep your progress, to protect players (rate limits, reports and moderation), and to improve the game from aggregate usage events. We do not sell your data or use it for advertising.</p>
        </Section>

        <Section title="Where it is stored">
          <p>
            The game runs on a hosting provider (Replit) and stores data in a database hosted by Supabase in Frankfurt,
            Germany (EU). These providers process data only to run the service for us. Connections are encrypted (HTTPS/TLS).
          </p>
        </Section>

        <Section title="On your device">
          <p>We keep your session token and your settings (graphics quality, sound, motion) in your browser’s local storage, plus an unfinished lock draft. Drafts never include your PIN or riddle answers.</p>
        </Section>

        <Section title="How long we keep it">
          <p>We keep your data while your account exists. Sessions expire after 90 days. Moderators may keep a short record of moderation decisions. When you delete your account, your profile, locks, stories, invitations, reactions and progress are deleted.</p>
        </Section>

        <Section title="Your choices and rights">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Edit or delete any of your locks from its page.</li>
            <li>Change your name, avatar and name visibility in <Link to="/profile" className="text-brass-300 underline">Profile → Settings</Link>.</li>
            <li>Delete your account and everything in it from Profile → Settings → Account.</li>
            <li>Depending on where you live (for example under the GDPR), you may also ask us for a copy of your data or to correct it. Contact us at <Contact />.</li>
          </ul>
        </Section>

        <Section title="Children">
          <p>Love Locks is for people aged 13 and over. If you are under the age of digital consent in your country, please ask a parent or guardian before creating an account. If you believe a child under 13 has an account, contact us and we will delete it.</p>
        </Section>

        <Section title="Changes">
          <p>If we change this policy in a meaningful way, we will update the date above and show a notice in the game.</p>
        </Section>
      </Card>
    </main>
  );
}

export function TermsScreen() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-nav pt-6">
      <PageHeader title="Terms of use" subtitle={`Last updated ${UPDATED}`} />
      <DraftNotice />
      <Card className="space-y-6 text-sm leading-relaxed text-ivory/80">
        <p>By using Love Locks you agree to these terms and to our <Link to="/privacy" className="text-brass-300 underline">privacy policy</Link>. Questions: <Contact />.</p>

        <Section title="The game">
          <p>Love Locks is a free virtual game. It is a digital tribute only: never attach physical locks to real bridges, railings or monuments.</p>
        </Section>

        <Section title="Your content">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>You keep ownership of the stories, engravings and titles you write.</li>
            <li>You give us permission to store your content and show it as your settings allow (for example to people who solve your puzzle), only to run the game.</li>
            <li>You are responsible for what you post. Only share stories you have the right to share, and never post someone else’s private information.</li>
          </ul>
        </Section>

        <Section title="Rules">
          <p>
            Follow the <Link to="/community" className="text-brass-300 underline">community guidelines</Link>: no harassment, threats,
            hate, sexual content, spam, or attempts to break, overload or get around the game’s protections (for example
            automated guessing of puzzles). We may hide or remove content and suspend accounts that break these rules.
          </p>
        </Section>

        <Section title="Accounts">
          <p>Keep your password and invitation links safe. You can delete your account at any time from Profile → Settings.</p>
        </Section>

        <Section title="Availability">
          <p>We work hard to keep the bridge standing, but the game is provided “as is”, without guarantees that it will always be available or error-free. Keep your own copy of anything precious to you. Features may change.</p>
        </Section>

        <Section title="Liability">
          <p>To the extent the law allows, we are not liable for indirect losses or for content posted by other players. Nothing in these terms limits rights you have under consumer law where you live.</p>
        </Section>

        <Section title="Changes">
          <p>We may update these terms. If a change is significant we will show a notice in the game; continuing to play means you accept the new terms.</p>
        </Section>
      </Card>
    </main>
  );
}
