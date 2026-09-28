export function displaySalary(value: string | null | undefined): string | null {
  if (!value) return null;

  const salary = value.trim().replace(/\s+/g, " ");
  if (!salary) return null;

  const amounts = [...salary.matchAll(/\d[\d.,]*/g)]
    .map(([amount]) => Number(amount.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")))
    .filter(Number.isFinite);

  if (amounts.length > 0 && amounts.every((amount) => amount === 0)) return null;

  const upperBoundOnly = salary.match(/^((?:EUR|USD|GBP|€|\$|£))\s*(?:0\s*)?[–—-]\s*(.+)$/i);
  if (upperBoundOnly) return `Tot ${upperBoundOnly[1]} ${upperBoundOnly[2]}`;

  return salary;
}
