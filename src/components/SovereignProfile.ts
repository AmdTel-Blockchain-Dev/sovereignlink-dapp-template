import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Profile – displays a DID-linked identity card.
 * Extend with real DID resolution logic via src/lib/did.ts.
 */
@customElement("sovereign-profile")
export class SovereignProfile extends LitElement {
  static override styles = css`
    :host {
      display: block;
      border: 1px solid var(--gray-3, #dee2e6);
      border-radius: var(--radius-3, 8px);
      padding: var(--size-4, 16px);
      max-inline-size: var(--size-content-1, 20rem);
    }
    h2 {
      font-size: var(--font-size-3, 1.125rem);
      margin-block-end: var(--size-2, 8px);
    }
    p {
      font-size: var(--font-size-1, 0.875rem);
      color: var(--gray-7, #495057);
      word-break: break-all;
    }
  `;

  @property() did = "";
  @property() alias = "Anonymous";

  override render() {
    return html`
      <h2>${this.alias}</h2>
      <p>${this.did || "No DID linked"}</p>
    `;
  }
}
