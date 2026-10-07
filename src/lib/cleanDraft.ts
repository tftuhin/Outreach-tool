/**
 * Utility to strip typed signatures and sign-offs from email draft bodies.
 * Default signatures are added automatically by the application (via Settings).
 */
export function cleanDraftBody(body: string | undefined | null): string {
  if (!body || typeof body !== 'string') return '';

  let cleaned = body;

  // 1. Separate opt-out / PS note if present at the end
  const psRegex = /(?:<p[^>]*>)?\s*(<i[^>]*>\s*PS:[\s\S]*?<\/i>)\s*(?:<\/p>)?|(?:\r?\n)+\s*(PS:\s*If you aren't interested[\s\S]*?)$/i;
  let psNote = '';
  const psMatch = cleaned.match(psRegex);
  if (psMatch) {
    psNote = psMatch[1] || psMatch[2] || psMatch[0];
    cleaned = cleaned.replace(psRegex, '');
  }

  // 2. Remove previously appended HTML signature blocks if any
  cleaned = cleaned.replace(/<div[^>]*>\s*(?:Best regards|Kind regards|Regards),?\s*<\/div>[\s\S]*$/i, '');

  // 3. Remove sign-offs and typed signatures
  // Matches sign-off phrases in plain text or HTML tags
  const signoffRegex = /(?:<p[^>]*>|<div[^>]*>|<br\s*\/?>|\r?\n|^)\s*(?:<\/?(?:strong|b|em|i)>)*\s*(?:Best regards|Kind regards|Warm regards|With regards|Regards|Sincerely|Best|Thanks & regards|Thanks and regards|Thanks,\s*\n|Thank you,\s*\n)[,\.]?\s*(?:<\/?(?:strong|b|em|i)>)*\s*(?:<\/(?:p|div)>)?[\s\S]*$/i;
  cleaned = cleaned.replace(signoffRegex, '');

  // 4. Clean trailing breaks, newlines, empty paragraphs
  cleaned = cleaned.replace(/(?:<p>\s*(?:<br\s*\/?>)*\s*<\/p>|<br\s*\/?>|\r?\n|\s)+$/gi, '');

  // 5. Re-append PS note if it was extracted and not already present
  if (psNote && !cleaned.includes(psNote)) {
    cleaned = cleaned + '\n\n' + psNote.trim();
  }

  return cleaned.trim();
}
