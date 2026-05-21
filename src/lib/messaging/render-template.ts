/**
 * Simple template renderer for message templates.
 *
 * Replaces {{placeholder}} tokens with provided values.
 * Missing values are replaced with an empty string to fail safely.
 */

export interface TemplateVariables {
  business_name?: string;
  first_name?: string;
  last_name?: string;
  google_review_link?: string;
  [key: string]: string | undefined;
}

export function renderTemplate(
  template: string,
  variables: TemplateVariables
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value ?? "";
  });
}
