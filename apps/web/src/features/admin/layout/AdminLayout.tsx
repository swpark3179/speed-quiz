import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { m } from 'motion/react';
import { KeyRound, LibraryBig, LogOut, ShieldCheck, Trophy, UserRound } from 'lucide-react';
import { screenVariants } from '@/design/motion';
import { cn } from '@/lib/format';
import { Avatar, Logo } from '@/ui/display';
import { useLogout, useMe } from '../session';
import { PasswordChangeDialog } from '../components/common';

const BASE_NAV = [
  { to: '/admin/rooms', label: '퀴즈방', icon: Trophy },
  { to: '/admin/questions', label: '문제은행', icon: LibraryBig },
  { to: '/admin/me', label: '내 계정', icon: UserRound },
] as const;
const MAIN_NAV = { to: '/admin/accounts', label: '관리자 관리', short: '관리자', icon: ShieldCheck } as const;
type NavItem = { to: string; label: string; short?: string; icon: typeof Trophy };

export default function AdminLayout() {
  const me = useMe();
  const logout = useLogout();
  const loc = useLocation();
  const [pwOpen, setPwOpen] = useState(false);
  const name = me.data?.displayName ?? '';
  const NAV: NavItem[] = me.data?.role === 'MAIN' ? [...BASE_NAV, MAIN_NAV] : [...BASE_NAV];
  const section = loc.pathname.split('/').slice(0, 3).join('/');

  return (
    <div className="min-h-dvh bg-bg">
      {/* Sidebar (lg+) / icon rail (md) */}
      <aside className="fixed inset-y-0 left-0 z-(--z-sticky) hidden w-[72px] flex-col border-r border-line bg-surface md:flex lg:w-60">
        <div className="flex h-16 items-center justify-center px-4 lg:justify-start lg:px-5">
          <NavLink to="/admin/rooms" aria-label="스피드 퀴즈 홈">
            <Logo compact className="lg:hidden" />
            <Logo className="hidden text-lg lg:inline-flex" />
          </NavLink>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="관리자 메뉴">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                cn(
                  'relative flex h-12 items-center justify-center gap-3 rounded-md px-3 font-bold transition-colors lg:justify-start',
                  isActive ? 'bg-ink text-white' : 'text-fg-muted hover:bg-n-100 hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="hidden lg:inline">{label}</span>
                  {isActive && <span className="absolute top-2 right-2 size-2 rounded-full bg-spark-400 lg:top-1/2 lg:right-3 lg:-translate-y-1/2" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-line p-3">
          <div className="mb-1 flex items-center justify-center gap-3 px-1 py-2 lg:justify-start">
            <Avatar id={me.data?.id ?? 0} name={name || '?'} size={36} />
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-bold">{name}</p>
              <p className="truncate text-xs text-fg-muted">{me.data?.username}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            title="비밀번호 변경"
            className="flex h-11 items-center justify-center gap-3 rounded-md px-3 text-sm font-bold text-fg-muted hover:bg-n-100 hover:text-fg lg:justify-start"
          >
            <KeyRound className="size-5 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">비밀번호 변경</span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            title="로그아웃"
            className="flex h-11 items-center justify-center gap-3 rounded-md px-3 text-sm font-bold text-fg-muted hover:bg-danger-tint hover:text-danger-text lg:justify-start"
          >
            <LogOut className="size-5 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">로그아웃</span>
          </button>
        </div>
      </aside>

      {/* Top app bar (<md) */}
      <header className="sticky top-0 z-(--z-sticky) flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <NavLink to="/admin/rooms" aria-label="스피드 퀴즈 홈">
          <Logo className="text-lg" />
        </NavLink>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className="inline-flex size-11 items-center justify-center rounded-sm text-fg-muted hover:bg-n-100"
            aria-label="비밀번호 변경"
          >
            <KeyRound className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex size-11 items-center justify-center rounded-sm text-fg-muted hover:bg-n-100"
            aria-label="로그아웃"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      <main className="px-4 pt-5 pb-28 md:ml-[72px] md:px-8 md:pt-8 md:pb-12 lg:ml-60">
        <div className="mx-auto w-full max-w-6xl">
          {/* keyed enter-only transition: the outlet swaps instantly, the new page eases in */}
          <m.div key={section} variants={screenVariants} initial="initial" animate="animate">
            <Outlet />
          </m.div>
        </div>
      </main>

      {/* Bottom tab bar (<md) */}
      <nav
        style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}
        className="fixed inset-x-0 bottom-0 z-(--z-sticky) grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="관리자 메뉴"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn('flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold', isActive ? 'text-ink' : 'text-n-500')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive && 'bg-spark-400')}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  {item.short ?? item.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <PasswordChangeDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}
