import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { FontId, WeddingDesign } from '../lib/types';

interface InvitationAppearance { font: FontId; buttonShape?: WeddingDesign['buttonShape']; }
const AppearanceContext = createContext<InvitationAppearance | undefined>(undefined);

/** React context follows public dialogs and music controls into their portals. */
export function InvitationFontProvider({ font, buttonShape, children }: InvitationAppearance & { children: ReactNode }) {
  return <AppearanceContext.Provider value={{ font, buttonShape }}>{children}</AppearanceContext.Provider>;
}

export function useInvitationFont() { return useContext(AppearanceContext)?.font; }
export function useInvitationButtonShape() { return useContext(AppearanceContext)?.buttonShape; }
