/**
 * Motion's animation engine, for the public page. It sits in a module of its own because that is
 * what lets the build put it in a separate chunk, which `Landing.tsx` requests after it mounts.
 */
export { domMax as default } from "motion/react";
