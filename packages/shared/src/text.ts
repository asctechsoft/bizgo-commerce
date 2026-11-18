/** Remove Vietnamese diacritics and lowercase (search normalisation). */
export function normalizeVi(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** URL slug: ascii, lowercase, words joined by '-'. */
export function slugify(input: string): string {
  return normalizeVi(input)
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Strip LaTeX residue found in source notes: "Quy cách $5\text{ kg}$/bao" → "Quy cách 5 kg/bao". */
export function stripLatexResidue(input: string): string {
  return input
    .replace(/\$([^$]*)\$/g, (_m, inner: string) => inner.replace(/\\text\{([^}]*)\}/g, '$1'))
    .replace(/\s+/g, ' ')
    .trim();
}
