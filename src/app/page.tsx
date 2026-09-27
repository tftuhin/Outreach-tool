"use client";

import { useState } from "react";

// Mock Data matching the new generalized schema, including WhatsApp
const mockLeads = [
  {
    lead_id: "lead_001",
    tier: "Tier 1",
    business_name: "Fatiha Dental Care",
    area: "Banasree (Rampura)",
    owner_details: {
      name: "Dr. Nur Tasmia Taharat",
      license_credentials: "BM&DC 14752",
      graduation_experience: "BDS (DU), MPH (NSU), PGT OMS",
    },
    contact_info: {
      phone_whatsapp: "+880 1747-590417",
      email: "fatihadentalcare@gmail.com",
      website: "https://www.fatihadentalcare.com",
      facebook: "",
      linkedin: "",
      address: "House 18, Road 6, Block C, Banasree, Rampura, Dhaka-1219",
    },
    business_context: {
      business_size: "4 professionals listed; est. 6–8 staff",
      hours: "Sat–Thu 10am–9pm",
      local_competitors: "RH Dental Care, Takwa Dental",
    },
    marketing_angles: {
      snapshot: "Young, female-led business with polished website.",
      growth_signals: "Collects bookings online and via WhatsApp.",
      automation_angle: "Instant WhatsApp reply + confirmed slot.",
    },
    draft_message: {
      whatsapp: "Assalamu Alaikum Dr. Tasmia — this is Tuhin from Zeon Studio. Noticed fatihadentalcare.com runs on WhatsApp and Dentzo for booking. We set up automatic WhatsApp replies, serial confirmations, recall and Google review requests for clinics — 15 minutes to show you how it would work alongside Dentzo?",
      subject: "Fatiha Dental Care — every tap lands on WhatsApp — and what answers it?",
      body: "Dr. Tasmia —\n\nI came across Fatiha Dental Care while mapping the newer clinics in Banasree, and yours stands out: a young team, laser and aesthetic positioning, a WhatsApp button and online booking already in place.\n\nOne small thing from the outside: everything on fatihadentalcare.com routes to WhatsApp and Dentzo — and a patient comparing you with RH Dental will judge you on how fast that button gets an answer.\n\nWe set up automatic WhatsApp replies, serial confirmations, recall and Google review requests for clinics — 15 minutes to show you how it would work alongside Dentzo?\n\n— Tuhin · Zeon Studio",
    },
    status: "pending", 
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [leads, setLeads] = useState(mockLeads);

  const selectedLead = leads.find(l => l.lead_id === selectedLeadId);
  
  const filteredLeads = leads.filter(lead => {
    if (activeTab === "pending") return lead.status === "pending";
    if (activeTab === "outreached") return lead.status === "outreached";
    if (activeTab === "responded") return lead.status === "responded";
    return true;
  });

  const getTierClass = (tier: string) => {
    if (tier === "Tier 1") return "b1";
    if (tier === "Tier 2") return "b2";
    return "b3";
  };

  const handleInputChange = (fieldPath: string, value: string) => {
    if (!selectedLead) return;
    
    const keys = fieldPath.split('.');
    const updatedLead = JSON.parse(JSON.stringify(selectedLead));
    
    if (keys.length === 1) {
      updatedLead[keys[0]] = value;
    } else if (keys.length === 2) {
      updatedLead[keys[0]][keys[1]] = value;
    }

    setLeads(leads.map(l => l.lead_id === updatedLead.lead_id ? updatedLead : l));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Zeon Outreach Hub</h1>
        </div>
        
        <div className="tabs-container">
          <button 
            className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => { setActiveTab("pending"); setSelectedLeadId(null); setIsEditing(false); }}
          >
            Pending
          </button>
          <button 
            className={`tab-btn ${activeTab === "outreached" ? "active" : ""}`}
            onClick={() => { setActiveTab("outreached"); setSelectedLeadId(null); setIsEditing(false); }}
          >
            Outreached
          </button>
        </div>

        <div className="lead-list">
          {filteredLeads.map((lead) => (
            <div 
              key={lead.lead_id} 
              className={`lead-card ${selectedLead?.lead_id === lead.lead_id ? "selected" : ""}`}
              onClick={() => { setSelectedLeadId(lead.lead_id); setIsEditing(false); }}
            >
              <h3>{lead.business_name}</h3>
              <p>
                <span className={`badge ${getTierClass(lead.tier)}`}>{lead.tier}</span>
                {lead.area}
              </p>
            </div>
          ))}
          {filteredLeads.length === 0 && (
             <div style={{textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '13px'}}>
               No leads in this view.
             </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="btn" onClick={() => copyToClipboard(leads.map(l => l.contact_info.email).join(', '))}>
            Copy All Emails
          </button>
          <button className="btn" onClick={() => copyToClipboard(leads.map(l => l.draft_message.whatsapp).join('\n\n---\n\n'))}>
            Copy All WhatsApp
          </button>
        </header>

        {selectedLead ? (
          <div className="detail-view">
            <div className="detail-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
              <div>
                {isEditing ? (
                  <input 
                    style={{fontSize: '22px', fontWeight: 'bold', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', marginBottom: '6px', width: '100%'}}
                    value={selectedLead.business_name}
                    onChange={(e) => handleInputChange('business_name', e.target.value)}
                  />
                ) : (
                  <h2>{selectedLead.business_name}</h2>
                )}
                <div className="detail-meta">
                  {isEditing ? (
                    <input style={{marginRight: '10px'}} value={selectedLead.area} onChange={(e) => handleInputChange('area', e.target.value)} />
                  ) : (
                    <span>📍 {selectedLead.area}</span>
                  )}
                  {isEditing ? (
                    <input style={{marginRight: '10px'}} value={selectedLead.owner_details.name} onChange={(e) => handleInputChange('owner_details.name', e.target.value)} />
                  ) : (
                    <span>👤 {selectedLead.owner_details.name}</span>
                  )}
                  <span><span className={`badge ${getTierClass(selectedLead.tier)}`}>{selectedLead.tier}</span></span>
                </div>
              </div>
              <button 
                className="btn" 
                style={{background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none'}}
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? 'Save Details' : 'Edit Details'}
              </button>
            </div>

            <div className="detail-body">
              <div className="sec">
                <h3>Contact Info</h3>
                <div className="grid">
                  <div className="kv">
                    <div className="k">Email</div>
                    {isEditing ? <input style={{width:'100%'}} value={selectedLead.contact_info.email} onChange={e => handleInputChange('contact_info.email', e.target.value)} /> : <div className="v">{selectedLead.contact_info.email}</div>}
                  </div>
                  <div className="kv">
                    <div className="k">Phone / WhatsApp</div>
                    {isEditing ? <input style={{width:'100%'}} value={selectedLead.contact_info.phone_whatsapp} onChange={e => handleInputChange('contact_info.phone_whatsapp', e.target.value)} /> : <div className="v">{selectedLead.contact_info.phone_whatsapp}</div>}
                  </div>
                  <div className="kv">
                    <div className="k">Website</div>
                    {isEditing ? <input style={{width:'100%'}} value={selectedLead.contact_info.website} onChange={e => handleInputChange('contact_info.website', e.target.value)} /> : <div className="v"><a href={selectedLead.contact_info.website} target="_blank" rel="noreferrer">{selectedLead.contact_info.website || 'N/A'}</a></div>}
                  </div>
                </div>
              </div>

              <div className="sec">
                <h3>Business Context & Profile</h3>
                <div className="grid">
                  <div className="kv">
                    <div className="k">Scale & Staff</div>
                    {isEditing ? <input style={{width:'100%'}} value={selectedLead.business_context.business_size} onChange={e => handleInputChange('business_context.business_size', e.target.value)} /> : <div className="v">{selectedLead.business_context.business_size}</div>}
                  </div>
                  <div className="kv">
                    <div className="k">Operating Hours</div>
                    {isEditing ? <input style={{width:'100%'}} value={selectedLead.business_context.hours} onChange={e => handleInputChange('business_context.hours', e.target.value)} /> : <div className="v">{selectedLead.business_context.hours}</div>}
                  </div>
                  <div className="kv">
                    <div className="k">Credentials</div>
                    {isEditing ? <input style={{width:'100%'}} value={selectedLead.owner_details.license_credentials} onChange={e => handleInputChange('owner_details.license_credentials', e.target.value)} /> : <div className="v">{selectedLead.owner_details.license_credentials}</div>}
                  </div>
                </div>
              </div>

              <div className="sec">
                <h3>Marketing Angle</h3>
                <div className="flag warn">
                  <strong>Snapshot:</strong> {isEditing ? <input style={{width:'100%', marginBottom: '4px'}} value={selectedLead.marketing_angles.snapshot} onChange={e => handleInputChange('marketing_angles.snapshot', e.target.value)} /> : selectedLead.marketing_angles.snapshot}<br/>
                  <strong>Angle:</strong> {isEditing ? <input style={{width:'100%'}} value={selectedLead.marketing_angles.automation_angle} onChange={e => handleInputChange('marketing_angles.automation_angle', e.target.value)} /> : selectedLead.marketing_angles.automation_angle}
                </div>
              </div>

              <div className="sec">
                <h3>WhatsApp Outreach</h3>
                <div className="mail">
                  <div className="bar">
                    <button className="btn" onClick={() => copyToClipboard(selectedLead.draft_message.whatsapp)}>Copy Message</button>
                    <a className="btn primary" href={`https://wa.me/${selectedLead.contact_info.phone_whatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(selectedLead.draft_message.whatsapp)}`} target="_blank" rel="noreferrer">Open WhatsApp</a>
                  </div>
                  <textarea 
                    style={{minHeight: '120px'}}
                    value={selectedLead.draft_message.whatsapp}
                    onChange={(e) => handleInputChange('draft_message.whatsapp', e.target.value)}
                  />
                </div>
              </div>

              <div className="sec">
                <h3>Email Outreach</h3>
                <div className="mail">
                  <div className="bar">
                    <div className="to"><strong>To:</strong> {selectedLead.contact_info.email}</div>
                    <button className="btn" onClick={() => copyToClipboard(selectedLead.draft_message.body)}>Copy Body</button>
                  </div>
                  <div className="subj">
                    <span className="lbl">Subject:</span>
                    <input 
                      type="text" 
                      value={selectedLead.draft_message.subject} 
                      onChange={(e) => handleInputChange('draft_message.subject', e.target.value)}
                    />
                  </div>
                  <textarea 
                    value={selectedLead.draft_message.body} 
                    onChange={(e) => handleInputChange('draft_message.body', e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            {activeTab === "pending" && (
              <div className="actions-row">
                <button className="btn primary">
                  Review & send with Gmail
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: '16px', opacity: 0.5}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
            <h2>Select a Lead</h2>
            <p style={{marginTop: 0}}>Choose a lead from the sidebar to review and send.</p>
          </div>
        )}
      </main>
    </div>
  );
}
