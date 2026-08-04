import { Button } from '@mantine/core'
import { Link } from 'react-router-dom'
import './LandingPage.css'

export function LandingPage() {
  return (
    <div className="sd-marketing">
      <header className="sd-marketing-nav">
        <a className="sd-marketing-brand" href="#top">
          SignDesk
        </a>
        <div className="sd-marketing-nav-actions">
          <Link className="sd-marketing-nav-link" to="/login">
            Log in
          </Link>
          <Button component={Link} to="/signup" size="sm" c="#fff">
            Start free
          </Button>
        </div>
      </header>

      <main id="top">
        <section className="sd-marketing-hero" aria-label="Introduction">
          <div className="sd-marketing-hero-panel">
            <div className="sd-marketing-hero-copy">
              <p className="sd-marketing-hero-brand sd-anim">SignDesk</p>
              <span className="sd-marketing-accent-line" aria-hidden />
              <h1 className="sd-marketing-hero-title sd-anim sd-anim-delay-1">
                E-sign that stays with your contacts.
              </h1>
              <p className="sd-marketing-hero-lede sd-anim sd-anim-delay-2">
                Send envelopes, collect signatures, and keep the paper trail next to the people
                you work with — in one calm workspace.
              </p>
              <div className="sd-marketing-cta-row sd-anim sd-anim-delay-3">
                <Button component={Link} to="/signup" size="md" c="#fff">
                  Start free workspace
                </Button>
                <Button component={Link} to="/login" variant="default" size="md">
                  Log in
                </Button>
              </div>
            </div>

            <div className="sd-marketing-mock-wrap sd-anim sd-anim-delay-2" aria-hidden>
              <div className="sd-marketing-mock">
                <div className="sd-marketing-mock-bar">
                  <span className="sd-marketing-mock-dot" />
                  <span className="sd-marketing-mock-dot" />
                  <span className="sd-marketing-mock-dot" />
                  <span className="sd-marketing-mock-title">Purchase agreement · Envelope</span>
                </div>
                <div className="sd-marketing-mock-body">
                  <aside className="sd-marketing-mock-side">
                    <div className="sd-marketing-mock-side-label">Signers</div>
                    <div className="sd-marketing-mock-row is-active">
                      <span className="sd-marketing-mock-avatar buyer">B</span>
                      Buyer · Signed
                    </div>
                    <div className="sd-marketing-mock-row">
                      <span className="sd-marketing-mock-avatar">S</span>
                      Seller · Waiting
                    </div>
                  </aside>
                  <div className="sd-marketing-mock-doc">
                    <h2 className="sd-marketing-mock-doc-heading">Sample Purchase Agreement</h2>
                    <p className="sd-marketing-mock-doc-meta">Page 1 of 3 · Ready for signature</p>
                    <div className="sd-marketing-mock-lines">
                      <div className="sd-marketing-mock-line w-90" />
                      <div className="sd-marketing-mock-line w-75" />
                      <div className="sd-marketing-mock-line w-90" />
                      <div className="sd-marketing-mock-line w-60" />
                      <div className="sd-marketing-mock-line w-75" />
                    </div>
                    <div className="sd-marketing-mock-sig">
                      <div>
                        <div className="sd-marketing-mock-sig-label">Buyer signature</div>
                        <div className="sd-marketing-mock-sig-name">Alex Morgan</div>
                      </div>
                      <span className="sd-marketing-mock-badge">Completed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sd-marketing-band sd-marketing-band--mint" aria-labelledby="how-heading">
          <div className="sd-marketing-section">
            <div className="sd-marketing-section-head">
              <div>
                <p className="sd-marketing-section-kicker">How it works</p>
                <h2 className="sd-marketing-section-title" id="how-heading">
                  From document to signed PDF.
                </h2>
              </div>
              <p className="sd-marketing-section-lede">
                Prepare once, invite the right people, and finish with a certificate you can trust.
              </p>
            </div>
            <div className="sd-marketing-steps">
              <article className="sd-marketing-step">
                <h3>Prepare the envelope</h3>
                <p>
                  Upload a PDF or start from a template. Place signature and form fields where they
                  belong.
                </p>
              </article>
              <article className="sd-marketing-step">
                <h3>Invite signers</h3>
                <p>
                  Send secure email invites in order. Recipients review, consent, and sign — no
                  account required.
                </p>
              </article>
              <article className="sd-marketing-step">
                <h3>Keep the record</h3>
                <p>
                  Download the flattened PDF and Certificate of Completion with a clear audit trail.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="sd-marketing-band sd-marketing-band--sand" aria-labelledby="workspace-heading">
          <div className="sd-marketing-section">
            <div className="sd-marketing-section-head">
              <div>
                <p className="sd-marketing-section-kicker">Your workspace</p>
                <h2 className="sd-marketing-section-title" id="workspace-heading">
                  Signing and CRM in the same place.
                </h2>
              </div>
              <p className="sd-marketing-section-lede">
                Contacts, companies, and follow-ups sit beside your envelopes — so history does not
                live in a separate inbox.
              </p>
            </div>
            <div className="sd-marketing-features">
              <article className="sd-marketing-feature">
                <h3>Contacts & companies</h3>
                <p>
                  Keep buyer, seller, and client records close at hand. Pull the right people into
                  an envelope without retyping.
                </p>
              </article>
              <article className="sd-marketing-feature">
                <h3>Templates & form library</h3>
                <p>
                  Save reusable layouts for agreements you send often. Start faster with fields
                  already placed.
                </p>
              </article>
              <article className="sd-marketing-feature">
                <h3>Follow-ups</h3>
                <p>
                  Schedule the next touch after a send or a signature so deals and paperwork keep
                  moving.
                </p>
              </article>
              <article className="sd-marketing-feature">
                <h3>Team workspaces</h3>
                <p>
                  Each company gets its own workspace. Invite owners, admins, and members with the
                  access they need.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="sd-marketing-close" aria-labelledby="close-heading">
          <div className="sd-marketing-close-copy">
            <h2 id="close-heading">Ready when you are.</h2>
            <p>Create a workspace in minutes and send your first envelope today.</p>
          </div>
          <div className="sd-marketing-cta-row">
            <Button component={Link} to="/signup" size="md" c="#fff">
              Start free workspace
            </Button>
            <Button component={Link} to="/login" variant="default" size="md">
              Log in
            </Button>
          </div>
        </section>
      </main>

      <footer className="sd-marketing-footer">
        <span className="sd-marketing-footer-brand">SignDesk</span>
        <nav className="sd-marketing-footer-links" aria-label="Legal">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
          <Link to="/login">Log in</Link>
        </nav>
      </footer>
    </div>
  )
}
