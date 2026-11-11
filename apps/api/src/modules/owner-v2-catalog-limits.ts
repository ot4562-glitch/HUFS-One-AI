/** #447 hard bound shared by HTTP transport and verified PostgreSQL keysets.
 * Never return partial totals or silently truncate authorized catalog scope. */
export const MAX_VERIFIED_V2_CATALOG_ROWS=5000;
export const VERIFIED_V2_KEYSET_PAGE_SIZE=50;
