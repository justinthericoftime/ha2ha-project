/**
 * Type declaration for json-canonicalize package
 * Implements RFC 8785 (JSON Canonicalization Scheme)
 */
declare module 'json-canonicalize' {
  /**
   * Convert a JavaScript value to canonical JSON format (RFC 8785).
   * 
   * @param obj - Any JSON-serializable value
   * @param allowCircular - If true, handle circular references by replacing with null
   * @returns Canonical JSON string
   */
  export function canonicalize(obj: unknown, allowCircular?: boolean): string;
  
  /**
   * Extended canonicalize with options.
   */
  export function canonicalizeEx(obj: unknown, options?: {
    allowCircular?: boolean;
    filterUndefined?: boolean;
    undefinedInArrayToNull?: boolean;
  }): string;
}
