// Which version of the Android shell this web build needs underneath it.
//
// A web build can be swapped into an installed app without reinstalling it, but only if the app's
// native half has everything the new web code calls: its notification scheduler, its haptics, and so
// on. Whoever adds a native feature the web code depends on raises this number here and the matching
// NATIVE_API in MomentumOta.java; an installed app whose native half is older than the number a new
// build asks for will not take that build, and says that it needs a reinstall instead.
export const REQUIRES_NATIVE_API = 1;
