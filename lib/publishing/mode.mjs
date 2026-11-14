// The selected product path is Blogger automatic + Pinterest manual scheduling.
// Only an explicit operator opt-in can run older Pinterest API functionality.
export const manualPinterestMode=()=>process.env.PINCRAFT_PUBLISHING_MODE!=='legacy_api';
export const PUBLISHING_MODE='blogger_manual_pin';
