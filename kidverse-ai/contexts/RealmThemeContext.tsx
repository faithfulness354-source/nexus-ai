import React, { createContext, useContext, useMemo } from 'react';

import { REALM_THEMES } from '@/constants/themes';
import type { AgeTier, RealmTheme } from '@/types';

const RealmThemeContext = createContext<RealmTheme>(REALM_THEMES.ages_5_7);

export function RealmThemeProvider({
  ageTier,
  children,
}: {
  ageTier: AgeTier;
  children: React.ReactNode;
}) {
  const theme = useMemo(() => REALM_THEMES[ageTier] ?? REALM_THEMES.ages_5_7, [ageTier]);
  return <RealmThemeContext.Provider value={theme}>{children}</RealmThemeContext.Provider>;
}

export function useRealmTheme() {
  return useContext(RealmThemeContext);
}
