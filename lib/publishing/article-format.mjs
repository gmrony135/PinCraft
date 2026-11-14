// Shared by the review UI and the authoritative server boundary. No Node,
// credentials, provider transport or privileged database dependency.
import { AutomationError } from '../automation/errors.mjs';
const reject = (code, message) => { throw new AutomationError(code, message); };
export function articleHTML(value) {
  const size = typeof value === 'string' ? new TextEncoder().encode(value).byteLength : 0;
  if (typeof value !== 'string' || size < 50 || size > 100000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) reject('invalid_article', 'Review article HTML between 50 bytes and 100 KB. Do not embed image bytes.');
  const allowed = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote']), stack = []; let at = 0;
  for (const token of value.matchAll(/<[^>]*>/g)) {
    if (value.slice(at, token.index).includes('<')) reject('invalid_html', 'Use simple article formatting without scripts or arbitrary attributes.');
    const match = /^<(\/?)([a-z0-9]+)>$/.exec(token[0]);
    if (token[0] !== '<br>' && (!match || !allowed.has(match[2]))) reject('invalid_html', 'Allowed HTML: p, h2, h3, ul, ol, li, strong, em, blockquote and br, without attributes.');
    if (match && allowed.has(match[2])) { if (match[1]) { if (stack.pop() !== match[2]) reject('invalid_html', 'Close the article formatting tags in order.'); } else stack.push(match[2]); }
    at = token.index + token[0].length;
  }
  if (stack.length || value.slice(at).includes('<') || !value.replace(/<[^>]*>/g, '').trim()) reject('invalid_html', 'The article HTML is incomplete. Check the preview and close its tags.');
  return value;
}
