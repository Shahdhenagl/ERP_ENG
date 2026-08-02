export interface Condition {
    label: string
    value: string
}

/**
 * The company's standing conditions, as stored in settings.
 *
 * Kept out of both the form and the print sheet so the two cannot drift: the
 * editor seeds a new offer from exactly the list the sheet would otherwise
 * have fallen back to.
 */
export function parseConditions(raw: string | undefined | null): Condition[] {
    if (!raw) return []

    try {
        const parsed: unknown = JSON.parse(raw)

        return Array.isArray(parsed)
            ? parsed
                  .filter(
                      (row): row is { label: unknown; value: unknown } =>
                          Boolean(row) && typeof row === 'object' && 'label' in row,
                  )
                  .map((row) => ({
                      label: String(row.label ?? ''),
                      // A condition with no value is deliberate: it prints as a
                      // dotted rule for whoever agrees the offer to write on.
                      value: row.value == null ? '' : String(row.value),
                  }))
            : []
    } catch {
        return []
    }
}
