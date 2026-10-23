/** This candidate has no distribution authority. Never call legacy health/install methods. */
export async function runMobileUpdate() { return 'disabled'; }
export const UPDATE_POLICY = Object.freeze({enabled:false, reason:'SIGNED_DISTRIBUTION_NOT_CONFIGURED'});
