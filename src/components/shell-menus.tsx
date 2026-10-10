'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogIn, LogOut, Menu, Plus, Search, type LucideIcon } from 'lucide-react';
import { Avatar } from './ui/avatar';
import { LanguageSwitch } from './language-switch';

// Closes a popover on outside clicks and on Escape.
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export type PageLink = { label: string; href: string };

// Jumps to a workspace page by name.
export function PageSearch({ pages }: { pages: PageLink[] }) {
  const t = useTranslations(),
    router = useRouter(),
    listId = useId();
  const [value, setValue] = useState('');
  function find(text: string) {
    const query = text.trim().toLocaleLowerCase();
    if (!query) return undefined;
    return (
      pages.find((page) => page.label.toLocaleLowerCase() === query) ||
      pages.find((page) => page.label.toLocaleLowerCase().includes(query))
    );
  }
  function go(page?: PageLink) {
    if (!page) return;
    setValue('');
    router.push(page.href);
  }
  return (
    <form
      role="search"
      className="topbar-search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        go(find(value));
      }}
    >
      <Search size={18} aria-hidden="true" />
      <input
        list={listId}
        aria-label={t('searchPages')}
        placeholder={t('searchPages')}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          // Choosing a suggestion fills in its exact label; open that page straight away.
          const exact = pages.find((page) => page.label === event.target.value);
          if (exact) go(exact);
        }}
      />
      <datalist id={listId}>
        {pages.map((page) => (
          <option key={page.href} value={page.label} />
        ))}
      </datalist>
    </form>
  );
}

export function AccountMenu({
  user,
  demo,
  signInHref,
  onSignOut,
}: {
  user: { name: string; email: string };
  demo: boolean;
  signInHref: string;
  onSignOut: () => void;
}) {
  const t = useTranslations(),
    menuId = useId();
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className="account-pill"
        aria-label={t('accountMenu')}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        <Menu size={20} aria-hidden="true" />
        <Avatar name={user.name} />
      </button>
      {open && (
        <div className="menu" id={menuId}>
          <div className="menu-profile">
            <Avatar name={user.name} />
            <div>
              <strong>{user.name}</strong>
              <small dir={demo ? undefined : 'ltr'}>{demo ? t('demo') : user.email}</small>
            </div>
          </div>
          <LanguageSwitch />
          {demo ? (
            <Link className="menu-item" href={signInHref}>
              <LogIn size={16} />
              {t('signIn')}
            </Link>
          ) : (
            <button type="button" className="menu-item" onClick={onSignOut}>
              <LogOut size={16} />
              {t('signOut')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type CreateAction = { label: string; href: string; icon: LucideIcon };

// The raspberry "+" button: quick links that open each page's create dialog.
export function CreateMenu({ actions }: { actions: CreateAction[] }) {
  const t = useTranslations(),
    router = useRouter(),
    menuId = useId();
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className="create-button"
        aria-label={t('createNew')}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        <Plus size={24} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" id={menuId}>
          <p className="menu-title">{t('createNew')}</p>
          {actions.map(({ label, href, icon: Icon }) => (
            <button
              type="button"
              key={href}
              className="menu-item"
              onClick={() => {
                setOpen(false);
                // A fresh value each time lets the target page reopen its dialog.
                router.push(`${href}?create=${Date.now()}`);
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
