import React from 'react'

export function Privacy() {
  return (
    <div className="card span-12" style={{padding:'20px'}}>
      <h2 className="section-title" style={{marginTop:0}}>Privacy & Compliance</h2>
      <p className="muted">GDPR / PDPA alignment · Data minimization · Participant rights</p>
      <div className="divider" />
      <h3>Cookie & Tracking</h3>
      <ul>
        <li>Necessary cookies only by default; analytics/3rd‑party are opt‑in.</li>
        <li>Granular control: Only necessary / Custom consent; change anytime.</li>
      </ul>
      <h3>Consent</h3>
      <ul>
        <li>Inform what we collect (anonymous / personal), how we use it and retention.</li>
        <li>Participants can withdraw at any time.</li>
      </ul>
      <h3>Storage & Security</h3>
      <ul>
        <li>Transport encryption (HTTPS/TLS). At‑rest encryption configurable.</li>
        <li>Access control enforced; least‑privilege for researcher accounts.</li>
      </ul>
      <h3>Participant Rights</h3>
      <ul>
        <li>Access / Rectification / Deletion / Portability (CSV/JSON by request).</li>
      </ul>
      <h3>Retention</h3>
      <ul>
        <li>Clear retention policy; periodic cleanup after study completion.</li>
      </ul>
      <h3>Contact</h3>
      <p>Data Protection Contact: privacy@synap.local</p>
    </div>
  )
}

