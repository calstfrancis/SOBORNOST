export let DEBUG=false;
export function setDebug(e){DEBUG=e;console.log(`Debug mode ${e?'enabled':'disabled'}`);}
export function debugLog(...a){if(DEBUG)console.log('[DEBUG]',...a);}
