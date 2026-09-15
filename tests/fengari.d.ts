/**
 * Just enough of fengari to run the addon.
 *
 * fengari is a Lua virtual machine in JavaScript. It is a development
 * dependency only: it exists so the addon can be loaded and run by the test
 * suite, since there is no Forever client to try it in.
 */
declare module 'fengari' {
  export const lua: {
    LUA_OK: number;
    LUA_MULTRET: number;
    lua_pcall(L: unknown, nargs: number, nresults: number, errfunc: number): number;
    lua_tostring(L: unknown, index: number): unknown;
    lua_getglobal(L: unknown, name: unknown): number;
    lua_setglobal(L: unknown, name: unknown): void;
    lua_pushstring(L: unknown, value: unknown): void;
    lua_pop(L: unknown, n: number): void;
  };
  export const lauxlib: {
    luaL_newstate(): unknown;
    luaL_loadbuffer(L: unknown, buffer: unknown, size: number | null, name: unknown): number;
  };
  export const lualib: {
    luaL_openlibs(L: unknown): void;
  };
  export function to_luastring(value: string): unknown;
  export function to_jsstring(value: unknown): string;
}
