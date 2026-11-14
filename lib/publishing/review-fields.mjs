// Client/server shared plain-copy rules. Indic vowel signs and other combining
// marks are part of normal written hashtags, not markup or extra credentials.
// A mark cannot start a tag; control/format characters remain disallowed.
export const validReviewHashtag = value => typeof value === 'string' && /^#[\p{L}\p{N}_][\p{L}\p{M}\p{N}_]{0,39}$/u.test(value);
export function validReviewText(value,max,multiline=false){
 const controls=multiline?/[<>\u0000-\u0009\u000b-\u001f\u007f]/:/[<>\u0000-\u001f\u007f]/;
 return typeof value==='string'&&Boolean(value.trim())&&value.trim().length<=max&&!controls.test(value);
}
