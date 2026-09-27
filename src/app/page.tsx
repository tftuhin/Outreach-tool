"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";

// Mock Data matching the new generalized schema, including WhatsApp
const mockLeads: any[] = [];

const getFirstUrl = (text: string | undefined | null) => {
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s)]+)/);
  return match ? match[1] : null;
};

const extractPhone = (str: string | undefined | null) => {
  if (!str) return '';
  const match = str.match(/\+?\d[\d\s-]{7,}\d/);
  return match ? match[0].trim() : '';
};

const cleanPhone = (phone: string) => phone.replace(/[^0-9+]/g, '');

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{cursor:'pointer', marginLeft:'6px', color:'var(--muted)'}}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

export default function App() {
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modules state
  const [modules, setModules] = useState<{id: number, name: string}[]>([]);
  const [activeModule, setActiveModule] = useState<string>("Dentist");
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [newModuleName, setNewModuleName] = useState("");
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // Export modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFilter, setExportFilter] = useState<'all' | 'pending' | 'outreached' | 'responded'>('all');

  // Gmail state
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [checkingReplies, setCheckingReplies] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Fetch leads and modules on mount
  useEffect(() => {
    fetch('/api/leads')
      .then(res => res.json())
      .then(data => {
        setLeads(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load leads", err);
        setIsLoading(false);
      });
      
    fetch('/api/modules')
      .then(res => res.json())
      .then(data => {
        setModules(data);
        if (data.length > 0) setActiveModule(data[0].name);
      })
      .catch(console.error);

    fetch('/api/auth/google/status')
      .then(res => res.json())
      .then(data => {
        if (data.connected) {
          setGmailConnected(true);
          setGmailEmail(data.email);
        }
      })
      .catch(console.error);
  }, []);

  const handleAddModule = async () => {
    if (!newModuleName.trim()) return;
    try {
      const res = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newModuleName.trim() })
      });
      const data = await res.json();
      setModules([...modules, data]);
      setActiveModule(data.name);
      setNewModuleName("");
      setIsAddingModule(false);
    } catch (err) {
      console.error("Failed to create module", err);
    }
  };

  const markAsOutreached = async (leadId: string) => {
    // Optimistic update
    setLeads(leads.map(l => l.lead_id === leadId ? { ...l, status: 'outreached' } : l));
    setSelectedLeadId(null);
    
    // API call
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'outreached' })
      });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const selectedLead = leads.find(l => l.lead_id === selectedLeadId);
  
  const moduleLeads = leads.filter(lead => (lead.module || 'Dentist') === activeModule);
  const pendingCount = moduleLeads.filter(l => l.status === 'pending').length;
  const outreachedCount = moduleLeads.filter(l => l.status === 'outreached').length;
  const respondedCount = moduleLeads.filter(l => l.status === 'responded').length;

  const filteredLeads = moduleLeads.filter(lead => {
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

  const saveLeadEdits = async () => {
    if (!selectedLead) return;
    setIsEditing(false);
    try {
      await fetch(`/api/leads/${selectedLead.lead_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedLead)
      });
    } catch (err) {
      console.error("Failed to save edits", err);
    }
  };
  const checkGmailReplies = async () => {
    setCheckingReplies(true);
    try {
      const res = await fetch('/api/gmail/receive', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Checked inbox. Found replies for ${data.updatedCount} leads!`);
        if (data.updatedCount > 0) {
          window.location.reload();
        }
      } else {
        alert(data.error || 'Failed to check replies');
      }
    } catch (err) {
      alert('Error checking replies');
    } finally {
      setCheckingReplies(false);
    }
  };

  const sendGmail = async (lead: any) => {
    if (!lead.draft_message?.subject || !lead.draft_message?.body || !lead.contact_info?.email) {
      alert("Missing email, subject, or body!");
      return;
    }
    
    if (!confirm(`Send email to ${lead.contact_info.email}?`)) return;
    
    setSendingEmail(true);
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.lead_id,
          to: lead.contact_info.email,
          subject: lead.draft_message.subject,
          body: lead.draft_message.body
        })
      });
      const data = await res.json();
      if (data.success) {
        alert("Email sent successfully!");
        setLeads(leads.map(l => l.lead_id === lead.lead_id ? { ...l, status: 'outreached' } : l));
        if (selectedLeadId === lead.lead_id) {
            setSelectedLeadId(null);
            setTimeout(() => setSelectedLeadId(lead.lead_id), 10);
        }
      } else {
        alert(data.error || "Failed to send email");
      }
    } catch (err) {
      alert("Error sending email");
    } finally {
      setSendingEmail(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const exportData = (format: 'csv' | 'json') => {
    const leadsToExport = exportFilter === 'all' 
      ? moduleLeads 
      : moduleLeads.filter(l => l.status === exportFilter);

    const flatLeads = leadsToExport.map(lead => ({
      business_name: lead.business_name,
      tier: lead.tier,
      area: lead.area,
      owner_name: lead.owner_details?.name,
      license_credentials: lead.owner_details?.license_credentials,
      graduation_experience: lead.owner_details?.graduation_experience,
      email: lead.contact_info?.email,
      phone_whatsapp: lead.contact_info?.phone_whatsapp,
      website: lead.contact_info?.website,
      address: lead.contact_info?.address,
      facebook: lead.contact_info?.facebook,
      linkedin: lead.contact_info?.linkedin,
      google_maps: lead.contact_info?.google_maps,
      location_note: lead.contact_info?.location_note,
      business_size: lead.business_context?.business_size,
      hours: lead.business_context?.hours,
      founder_age_est: lead.business_context?.founder_age_est,
      opened_since: lead.business_context?.opened_since,
      other_channels_notes: lead.business_context?.other_channels_notes,
      sources: lead.business_context?.sources,
      local_competitors: lead.business_context?.local_competitors,
      snapshot: lead.marketing_angles?.snapshot,
      growth_signals: lead.marketing_angles?.growth_signals,
      automation_angle: lead.marketing_angles?.automation_angle,
      status: lead.status,
      whatsapp_message: lead.draft_message?.whatsapp,
      email_subject: lead.draft_message?.subject,
      email_body: lead.draft_message?.body
    }));
    let content = '';
    let type = '';

    if (format === 'csv') {
      content = Papa.unparse(flatLeads);
      type = 'text/csv;charset=utf-8;';
    } else {
      content = JSON.stringify(flatLeads, null, 2);
      type = 'application/json;charset=utf-8;';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeModule}_leads.${format}`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportModalOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    
    const importLeads = async (data: any[]) => {
      try {
        const res = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module: activeModule, leads: data })
        });
        const resData = await res.json();
        if (resData.success) {
          alert(`Successfully imported ${resData.imported} leads!`);
          window.location.reload();
        } else {
          alert('Import failed.');
        }
      } catch (err) {
        alert('Error during import');
      } finally {
        setImporting(false);
        setIsImportModalOpen(false);
      }
    };

    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          importLeads(Array.isArray(json) ? json : [json]);
        } catch (err) {
          alert("Invalid JSON file");
          setImporting(false);
        }
      };
      reader.readAsText(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => importLeads(results.data)
      });
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header" style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
          <h1>Zeon Outreach Hub</h1>
          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
            {isAddingModule ? (
              <div style={{display: 'flex', flex: 1, gap: '4px'}}>
                <input 
                  autoFocus
                  style={{flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--line)'}} 
                  value={newModuleName} 
                  onChange={e => setNewModuleName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddModule()}
                  placeholder="Module name"
                />
                <button className="btn primary" style={{padding: '4px 8px'}} onClick={handleAddModule}>Add</button>
                <button className="btn" style={{padding: '4px 8px'}} onClick={() => setIsAddingModule(false)}>X</button>
              </div>
            ) : (
              <>
                <select 
                  style={{flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--line)', background: 'var(--bg)', fontWeight: '600'}}
                  value={activeModule}
                  onChange={(e) => { setActiveModule(e.target.value); setSelectedLeadId(null); }}
                >
                  {modules.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <button className="btn" style={{padding: '4px 10px', fontWeight: 'bold'}} onClick={() => setIsAddingModule(true)} title="Add New Module">+</button>
              </>
            )}
          </div>
        </div>
        
        <div className="tabs-container">
          <button 
            className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => { setActiveTab("pending"); setSelectedLeadId(null); setIsEditing(false); }}
          >
            Pending ({pendingCount})
          </button>
          <button 
            className={`tab-btn ${activeTab === "outreached" ? "active" : ""}`}
            onClick={() => { setActiveTab("outreached"); setSelectedLeadId(null); setIsEditing(false); }}
          >
            Outreached ({outreachedCount})
          </button>
          <button 
            className={`tab-btn ${activeTab === "responded" ? "active" : ""}`}
            onClick={() => { setActiveTab("responded"); setSelectedLeadId(null); setIsEditing(false); }}
          >
            Responded ({respondedCount})
          </button>
        </div>

        <div className="lead-list">
          {isLoading && (
            <div style={{textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '13px'}}>
               Loading leads from Neon...
            </div>
          )}
          {!isLoading && filteredLeads.map((lead) => (
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
          {!isLoading && filteredLeads.length === 0 && (
             <div style={{textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '13px'}}>
               No leads in this view.
             </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid var(--line)' }}>
          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
            {gmailConnected ? (
              <>
                <div style={{fontSize: '13px', color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  {gmailEmail}
                </div>
                <button className="btn" style={{padding: '4px 8px', fontSize: '12px'}} onClick={checkGmailReplies} disabled={checkingReplies}>
                  {checkingReplies ? 'Checking...' : 'Check Replies'}
                </button>
              </>
            ) : (
              <a href="/api/auth/google" className="btn primary" style={{padding: '6px 12px', fontSize: '12px', fontWeight: 600}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                Connect Gmail
              </a>
            )}
          </div>
          <div style={{display: 'flex', gap: '8px'}}>
            <button className="btn" style={{padding: '6px 12px', fontSize: '12px', fontWeight: 600}} onClick={() => setIsImportModalOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Import Data
            </button>
            <button className="btn" style={{padding: '6px 12px', fontSize: '12px', fontWeight: 600}} onClick={() => setIsExportModalOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Export Data
            </button>
          </div>
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
                onClick={() => isEditing ? saveLeadEdits() : setIsEditing(true)}
              >
                {isEditing ? 'Save Details' : 'Edit Details'}
              </button>
            </div>

            <div className="detail-body">
              <div className="sec">
                <h3>Contact Info</h3>
                <div className="grid">
                  <div className="kv" style={{gridColumn: '1 / -1'}}>
                    <div className="k">Address & Location</div>
                    {isEditing ? <input style={{width:'100%'}} value={selectedLead.contact_info.address} onChange={e => handleInputChange('contact_info.address', e.target.value)} /> : (
                      <ul className="comp-list" style={{marginTop:0}}>
                        <li>{selectedLead.contact_info.address}</li>
                        {selectedLead.contact_info.location_note && <li>{selectedLead.contact_info.location_note}</li>}
                        {getFirstUrl(selectedLead.contact_info.google_maps) && (
                          <li><a href={getFirstUrl(selectedLead.contact_info.google_maps)} target="_blank" rel="noreferrer" style={{color:'var(--brand)', textDecoration:'underline'}}>📍 Open in Google Maps</a></li>
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="kv">
                    <div className="k">Email</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li style={{display:'flex', alignItems:'center'}}>
                        <a href={`mailto:${selectedLead.contact_info.email}`} style={{color:'var(--brand)', textDecoration:'underline'}}>{selectedLead.contact_info.email}</a>
                        {selectedLead.contact_info.email && <span onClick={() => copyToClipboard(selectedLead.contact_info.email)} title="Copy Email"><CopyIcon /></span>}
                      </li>
                      {selectedLead.contact_info.alt_email && <li>{selectedLead.contact_info.alt_email}</li>}
                    </ul>
                    {selectedLead.draft_message?.subject && selectedLead.draft_message?.body && selectedLead.contact_info?.email && gmailConnected && (
                      <div style={{marginTop: '12px'}}>
                        <button className="btn primary" onClick={() => sendGmail(selectedLead)} disabled={sendingEmail} style={{padding: '6px 12px', fontSize: '12px'}}>
                          {sendingEmail ? 'Sending...' : '📤 Send Email via Gmail'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="kv">
                    <div className="k">Website</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li><a href={selectedLead.contact_info.website} target="_blank" rel="noreferrer" style={{color:'var(--brand)', textDecoration:'underline'}}>{selectedLead.contact_info.website || 'N/A'}</a></li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Phone & WhatsApp</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li>
                        {extractPhone(selectedLead.contact_info.phone_whatsapp) ? (
                          <>
                            <a href={`tel:${cleanPhone(extractPhone(selectedLead.contact_info.phone_whatsapp))}`} style={{color:'var(--brand)', textDecoration:'underline'}}>{extractPhone(selectedLead.contact_info.phone_whatsapp)}</a>
                            <a href={`https://wa.me/${cleanPhone(extractPhone(selectedLead.contact_info.phone_whatsapp))}`} target="_blank" rel="noreferrer" style={{marginLeft:'10px', color:'#25D366', textDecoration:'none', fontWeight:'bold'}}>💬 WhatsApp</a>
                          </>
                        ) : (
                          <span>{selectedLead.contact_info.phone_whatsapp || 'N/A'}</span>
                        )}
                      </li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Social Media</div>
                    <div className="v" style={{display:'flex', gap:'12px', alignItems:'center', marginTop:'8px'}}>
                      {getFirstUrl(selectedLead.contact_info.facebook) ? (
                        <a href={getFirstUrl(selectedLead.contact_info.facebook)} target="_blank" rel="noreferrer" title="Facebook">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </a>
                      ) : <span style={{color:'var(--muted)', fontSize:'12px'}}>No FB</span>}
                      {getFirstUrl(selectedLead.contact_info.linkedin) ? (
                        <a href={getFirstUrl(selectedLead.contact_info.linkedin)} target="_blank" rel="noreferrer" title="LinkedIn">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        </a>
                      ) : <span style={{color:'var(--muted)', fontSize:'12px'}}>No IN</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sec">
                <h3>Business Context & Profile</h3>
                <div className="grid">
                  <div className="kv">
                    <div className="k">Scale & Hours</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li><strong>Scale:</strong> {selectedLead.business_context.business_size}</li>
                      <li><strong>Hours:</strong> {selectedLead.business_context.hours}</li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Credentials</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li>{selectedLead.owner_details.license_credentials}</li>
                      <li>{selectedLead.owner_details.graduation_experience}</li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Age & Opening</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li><strong>Opened:</strong> {selectedLead.business_context.opened_since}</li>
                      <li><strong>Founder Est:</strong> {selectedLead.business_context.founder_age_est} {selectedLead.business_context.age_flag}</li>
                    </ul>
                  </div>
                  <div className="kv" style={{gridColumn: '1 / -1'}}>
                    <div className="k">Competitors & Notes</div>
                    <div className="v" style={{fontSize: '13px', lineHeight: '1.6'}}>
                      <strong style={{color:'var(--brand)'}}>Competitors:</strong>
                      {selectedLead.business_context.local_competitors ? (
                        <ul className="comp-list">
                          {selectedLead.business_context.local_competitors.split('|').map((comp: string, i: number) => (
                            <li key={i}>{comp.trim()}</li>
                          ))}
                        </ul>
                      ) : (
                        <div style={{marginBottom:'8px'}}>None listed</div>
                      )}
                      
                      <strong style={{color:'var(--brand)'}}>Sources:</strong> <span style={{color:'var(--muted)'}}>{selectedLead.business_context.sources || 'N/A'}</span><br/>
                      <div style={{marginTop: '8px'}}>
                        <strong style={{color:'var(--brand)'}}>Notes:</strong>
                        <div className="note-box">
                           {selectedLead.business_context.other_channels_notes || 'No additional notes.'}
                        </div>
                      </div>
                    </div>
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
                    <button className="btn" onClick={() => copyToClipboard(selectedLead.draft_message?.whatsapp || '')}>Copy Message</button>
                    <a className="btn primary" href={`https://wa.me/${selectedLead.contact_info?.phone_whatsapp?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(selectedLead.draft_message?.whatsapp || '')}`} target="_blank" rel="noreferrer">Open WhatsApp</a>
                  </div>
                  <textarea 
                    style={{minHeight: '220px'}}
                    value={selectedLead.draft_message?.whatsapp || ''}
                    onChange={(e) => handleInputChange('draft_message.whatsapp', e.target.value)}
                  />
                </div>
              </div>

              <div className="sec">
                <h3>Email Outreach</h3>
                <div className="mail">
                  <div className="bar">
                    <div className="to"><strong>To:</strong> {selectedLead.contact_info?.email || 'No email provided'}</div>
                    <button className="btn" onClick={() => copyToClipboard(selectedLead.draft_message?.body || '')}>Copy Body</button>
                  </div>
                  <div className="subj">
                    <span className="lbl">Subject:</span>
                    <input 
                      type="text" 
                      value={selectedLead.draft_message?.subject || ''} 
                      onChange={(e) => handleInputChange('draft_message.subject', e.target.value)}
                    />
                  </div>
                  <textarea 
                    style={{minHeight: '350px'}}
                    value={selectedLead.draft_message?.body || ''} 
                    onChange={(e) => handleInputChange('draft_message.body', e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            <div className="actions-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {isEditing ? (
                <>
                  <button className="btn primary" onClick={saveLeadEdits}>Save Changes</button>
                  <button className="btn" onClick={() => setIsEditing(false)}>Cancel</button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => setIsEditing(true)}>Edit Details</button>
                  <div style={{flex: 1}}></div>
                  {activeTab === "pending" && (
                    <button className="btn primary" onClick={() => {}}>
                      Review & send with Gmail
                    </button>
                  )}
                  {selectedLead.status !== 'outreached' && (
                    <button className="btn primary" style={{background: '#10b981', color: '#fff', borderColor: '#10b981'}} onClick={() => markAsOutreached(selectedLead.lead_id)}>
                      ✓ Mark as Outreached
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: '16px', opacity: 0.5}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
            <h2>Select a Lead</h2>
            <p style={{marginTop: 0}}>Choose a lead from the sidebar to review and send.</p>
          </div>
        )}
      </main>

      {isImportModalOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div style={{background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}}>
            <h2 style={{marginTop: 0, fontSize: '18px'}}>Import Leads</h2>
            <p style={{fontSize: '14px', color: 'var(--muted)', lineHeight: '1.5'}}>
              Upload a CSV or JSON file to import leads into the <strong>{activeModule}</strong> module.
            </p>
            <div style={{margin: '16px 0', display: 'flex', gap: '16px'}}>
               <a href="/example_template.csv" download style={{color: 'var(--brand)', fontSize: '13px', textDecoration: 'underline'}}>Template (CSV)</a>
               <a href="/example_template.json" download style={{color: 'var(--brand)', fontSize: '13px', textDecoration: 'underline'}}>Template (JSON)</a>
            </div>
            <input type="file" accept=".csv,.json" onChange={handleFileUpload} disabled={importing} style={{display: 'block', width: '100%', padding: '12px', border: '1px dashed var(--line)', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer'}} />
            {importing && <p style={{fontSize: '13px', color: 'var(--brand)', marginTop: '12px', fontWeight: 600}}>Importing leads... Please wait.</p>}
            <div style={{marginTop: '24px', display: 'flex', justifyContent: 'flex-end'}}>
              <button className="btn" onClick={() => setIsImportModalOpen(false)} disabled={importing}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isExportModalOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div style={{background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}}>
            <h2 style={{marginTop: 0, fontSize: '18px'}}>Export Leads</h2>
            <p style={{fontSize: '14px', color: 'var(--muted)', lineHeight: '1.5', marginBottom: '16px'}}>
              Download leads from the <strong>{activeModule}</strong> module.
            </p>
            <div style={{marginBottom: '20px'}}>
              <label style={{display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px'}}>Filter by Status:</label>
              <select 
                style={{width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--line)', background: '#f8fafc', fontSize: '14px'}}
                value={exportFilter}
                onChange={(e) => setExportFilter(e.target.value as any)}
              >
                <option value="all">All ({moduleLeads.length})</option>
                <option value="pending">Pending ({pendingCount})</option>
                <option value="outreached">Outreached ({outreachedCount})</option>
                <option value="responded">Responded ({respondedCount})</option>
              </select>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px', margin: '20px 0'}}>
              <button className="btn" style={{justifyContent: 'center', padding: '12px', fontWeight: 600}} onClick={() => exportData('csv')}>
                Download CSV (.csv)
              </button>
              <button className="btn" style={{justifyContent: 'center', padding: '12px', fontWeight: 600}} onClick={() => exportData('json')}>
                Download JSON (.json)
              </button>
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end'}}>
              <button className="btn" onClick={() => setIsExportModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
