'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Globe2, LockKeyhole, Search, ShieldCheck, Users } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import type { FormKind } from './workspace-form';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { Empty } from './ui/empty';

const languageNames: Record<string, string> = { en: 'English', ar: 'العربية', ckb: 'کوردی' };

export function BusinessesPage({
  data,
  openForm,
}: {
  data: WorkspaceData;
  openForm: (kind: FormKind, agencyId?: string) => void;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const admin = data.user.platformAdmin;
  const items = data.agencies.filter((a) =>
    `${a.name} ${a.slug}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar">
        <span>{t('agencyCount', { count: data.agencies.length })}</span>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={t('searchAgencies')}
            placeholder={t('searchAgencies')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <section className="panel">
        {items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('agency')}</th>
                  <th>{t('language')}</th>
                  <th>{t('members')}</th>
                  <th>{t('status')}</th>
                  {admin && <th>{t('businessLogin')}</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((a, i) => {
                  const connected = data.centralWhatsapp
                    ? true
                    : data.connections.some((c) => c.agencyId === a.id);
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="identity">
                          <Avatar name={a.name} index={i} />
                          <span>
                            <strong>{a.name}</strong>
                            <small>{a.industry}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="language-cell">
                          <Globe2 size={13} />
                          {languageNames[a.locale]}
                        </span>
                      </td>
                      <td>
                        <span className="member-count">
                          <Users size={14} />
                          {data.members.filter((m) => m.agencyId === a.id).length}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${connected ? 'badge-green' : 'badge-neutral'}`}>
                          <i />
                          {t(connected ? 'active' : 'needsSetup')}
                        </span>
                      </td>
                      {admin && (
                        <td>
                          <Button
                            variant="outline"
                            onClick={() => openForm('business-access', a.id)}
                          >
                            <LockKeyhole size={14} />
                            {t('businessLogin')}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={Building2}
            title={t(query ? 'noResults' : 'emptyAgencies')}
            subtitle={t('emptyAgenciesSub')}
          />
        )}
      </section>
    </>
  );
}

export function TeamPage({ data }: { data: WorkspaceData }) {
  const t = useTranslations();
  const totalPeople = new Set(data.members.map((m) => m.email)).size;
  return (
    <>
      <div className="toolbar">
        <span>{t('allPeople', { count: totalPeople })}</span>
      </div>
      <section className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('person')}</th>
              <th>{t('agency')}</th>
              <th>{t('role')}</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m, i) => (
              <tr key={m.id}>
                <td>
                  <div className="identity">
                    <Avatar name={m.name} index={i} />
                    <span>
                      <strong>{m.name}</strong>
                      <small dir="ltr">{m.email}</small>
                    </span>
                  </div>
                </td>
                <td>{m.agencyName}</td>
                <td>
                  <span
                    className={`badge ${m.role === 'owner' || m.role === 'admin' ? 'badge-green' : 'badge-neutral'}`}
                  >
                    {t(m.role)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.members.length && <Empty icon={Users} title={t('noMembers')} />}
      </section>
      <div className="notice subtle">
        <ShieldCheck size={20} />
        <p>{t('roleHelp')}</p>
      </div>
    </>
  );
}
