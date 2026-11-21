import { lazy, Suspense, useEffect } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Spinner } from './components/ui.tsx';
import { track } from './lib/analytics.ts';
import { InvitePage } from './screens/InvitePage.tsx';
import { LockPage } from './screens/LockPage.tsx';
import { ExploreScreen } from './screens/ExploreScreen.tsx';
import { ChallengesScreen } from './screens/ChallengesScreen.tsx';
import { ProfileScreen } from './screens/ProfileScreen.tsx';
import { AuthScreen } from './screens/AuthScreen.tsx';
import { CommunityScreen } from './screens/CommunityScreen.tsx';
import { AdminScreen } from './screens/AdminScreen.tsx';

// 3D-heavy screens load Babylon on demand; the invitation page never pays that cost.
const LandingScreen = lazy(() => import('./screens/LandingScreen.tsx'));
const BridgeScreen = lazy(() => import('./screens/BridgeScreen.tsx'));
const WorkshopScreen = lazy(() => import('./screens/WorkshopScreen.tsx'));

const NAV = [
  { to: '/bridge', label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { to: '/explore', label: 'Explore', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3' },
  { to: '/create', label: 'Create', icon: 'M12 5v14M5 12h14', primary: true },
  { to: '/challenges', label: 'Challenges', icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM5 4H3v2a3 3 0 0 0 4 3M19 4h2v2a3 3 0 0 1-4 3' },
  { to: '/profile', label: 'Profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
];

function BottomNav() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night-950/85 backdrop-blur-xl" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <ul className="mx-auto flex max-w-lg items-end justify-around px-2 pt-1.5">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} className={({ isActive }) =>
              `flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] transition ${isActive ? 'text-brass-300' : 'text-ivory/55 hover:text-ivory'}`}>
              {n.primary ? (
                <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-brass-300 to-brass-500 text-night-950 shadow-glow">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d={n.icon} /></svg>
                </span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
              )}
              <span>{n.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function App() {
  const loc = useLocation();
  const bare = loc.pathname === '/' || loc.pathname.startsWith('/i/');
  useEffect(() => { track('app_open', { path: loc.pathname.startsWith('/i/') ? '/i' : loc.pathname }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <>
      <Suspense fallback={<Spinner label="Opening" />}>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/bridge" element={<BridgeScreen />} />
          <Route path="/explore" element={<ExploreScreen />} />
          <Route path="/create" element={<WorkshopScreen />} />
          <Route path="/lock/:id" element={<LockPage />} />
          <Route path="/i/:token" element={<InvitePage />} />
          <Route path="/challenges" element={<ChallengesScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/auth" element={<AuthScreen />} />
          <Route path="/community" element={<CommunityScreen />} />
          <Route path="/admin" element={<AdminScreen />} />
          <Route path="*" element={<div className="p-10 text-center"><p className="font-display text-3xl">This path leads into the Seine.</p><NavLink to="/bridge" className="mt-4 inline-block text-brass-300 underline">Back to the bridge</NavLink></div>} />
        </Routes>
      </Suspense>
      {!bare && <BottomNav />}
    </>
  );
}
