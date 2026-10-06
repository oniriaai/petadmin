/**
 * Motion's animation engine, for the public page. It sits in a module of its own because that is
 * what lets the build put it in a separate chunk, which `Landing.tsx` requests after it mounts.
 *
 * `domAnimation` is the smaller engine. It does everything the page asks of Motion (the panel
 * swap, the price fade, the line drawn on scroll) and leaves out layout projection, which the
 * sliding pills no longer use.
 */
export { domAnimation as default } from "motion/react";
