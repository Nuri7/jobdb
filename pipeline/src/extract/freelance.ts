/** Explicit exclusions win over a board's broad "freelance" category. Interim alone is unknown. */
export function freelanceEligibility(text: string, structured?: boolean | null): boolean | null {
  const value = text.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const exclusion = /\b(?:geen|no|zonder)\s+(?:inzet\s+van\s+)?(?:zzp[’' -]?(?:ers?)?|freelancers?|freelance)\b|\b(?:niet|not)\s+(?:geschikt|mogelijk|toegestaan|available|open|suitable)(?:\s+\w+){0,4}\s+(?:zzp|freelanc)|\b(?:zzp[’' -]?(?:ers?)?|freelancers?)(?:\s+\w+){0,3}\s+(?:uitgesloten|niet toegestaan|not allowed)|\b(?:enkel|uitsluitend|alleen)\s+(?:via\s+)?(?:detachering|loondienst|payroll)/i;
  if (structured === false || exclusion.test(value)) return false;
  if (structured === true) return true;
  if (/\b(?:zzp|freelance)(?:[’' -]?ers?)?\s*(?:[:=-]\s*)?(?:mogelijk|toegestaan|welkom|geschikt|ja)\b|\b(?:geschikt voor|open voor|ook voor|inzet van|werken als)\s+(?:een\s+)?(?:zzp|freelanc)|\bzelfstandig(?:e)?\s+(?:professional|ondernemer|opdrachtnemer)\b/i.test(value)) return true;
  // Only trust explicit type labels, not incidental mentions of freelancers in a long description.
  if (/^(?:freelance|zzp)(?:\s|$|[/:,-])/i.test(value)) return true;
  return null;
}
