/**
 * Joins class names, skipping the falsy ones. Apart from `utils.ts` so that the brand marks and
 * the public page, which need nothing else from it, do not pull date-fns in with it.
 */
export function cls(...args: (string | undefined | false | null)[]) {
  return args.filter(Boolean).join(" ");
}
