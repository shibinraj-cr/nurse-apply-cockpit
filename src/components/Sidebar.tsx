'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▤' },
  { href: '/candidates', label: 'Candidates', icon: '◎' },
  { href: '/jobs', label: 'Jobs & ranking', icon: '⌕' },
  { href: '/applications', label: 'Applications', icon: '✎' },
  { href: '/consent', label: 'Consent', icon: '⎷' },
  { href: '/audit', label: 'Audit log', icon: '☷' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <span className="w-4 text-center text-base leading-none opacity-80">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
